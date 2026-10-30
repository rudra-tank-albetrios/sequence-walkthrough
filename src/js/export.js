/* ===================== Files, clipboard, codecs ===================== */
let downloadsCap = null;
if (window.claude && typeof window.claude.use === 'function') {
  window.claude.use('downloads').then((d) => { downloadsCap = d; }).catch(() => { downloadsCap = null; });
}
const Files = {
  base() {
    const t = (S.flow?.title || DEFAULT_TITLE).replace(/[\\/:*?"<>|]/g, '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120).trim();
    return t || DEFAULT_TITLE;
  },
  async save(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    App.debug.lastSave = { name, size: blob.size, type: blob.type };
    if (downloadsCap) {
      try {
        await downloadsCap.save({ filename: name, data: blob });
        Shell.toast(`Saved ${name}`);
      } catch (err) {
        const code = err?.code;
        if (code === 'declined') return;
        if (code === 'rejected_extension') {
          Shell.toast(`.${name.split('.').pop()} files can't be saved from this page. The text is the same in a .txt file.`, { label: 'Save as .txt', fn: () => Files.save(name + '.txt', blob) });
          return;
        }
        Shell.toast(`Could not save ${name}: ${err?.message || code || 'unavailable'}`);
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.addEventListener('click', (e) => e.stopPropagation()); // keep open popovers open
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    Shell.toast(`Downloaded ${name}`);
  },
  async copy(text, what = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      Shell.toast(what);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      if (ok) { Shell.toast(what); return true; }
      Modal.text('Copy this', text);
      return false;
    }
  },
};

const Codec = {
  async deflate(str) {
    const s = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  },
  async inflate(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new TextDecoder().decode(await new Response(s).arrayBuffer());
  },
  b64url(u8) { return b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  unb64(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  },
  /** Same format mermaid.live uses: #pako:<base64url(zlib(JSON state))>. */
  async liveLink(code) {
    const state = { code, mermaid: JSON.stringify({ theme: S.settings.theme }, null, 2), autoSync: true, rough: false, updateDiagram: true, panZoom: true, grid: S.settings.grid };
    return 'https://mermaid.live/edit#pako:' + this.b64url(await this.deflate(JSON.stringify(state)));
  },
  async fromLive(link) {
    const m = String(link).trim().match(/#(pako|base64):([A-Za-z0-9\-_+/=]+)/);
    if (!m) throw new Error('This is not a mermaid.live link');
    const json = m[1] === 'pako' ? await this.inflate(this.unb64(m[2])) : new TextDecoder().decode(this.unb64(m[2]));
    const st = JSON.parse(json);
    let theme = null;
    try { theme = JSON.parse(st.mermaid || '{}').theme || null; } catch { theme = null; }
    return { code: st.code || '', theme };
  },
};

/* ===================== Import ===================== */
const Importer = {
  isLiveLink(t) { return /^\s*https?:\/\/(www\.)?mermaid\.(live|ink)\/[^\s]*#(pako|base64):/.test(t || ''); },
  looksLikeMermaid(t) {
    const first = String(t || '').split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('%%') && l !== '---');
    return !!first && /^(sequenceDiagram|flowchart|graph|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|xychart|sankey|block|packet|kanban|architecture|requirementDiagram|C4)/.test(first);
  },
  async fromText(t) {
    try {
      if (this.isLiveLink(t)) {
        const { code, theme } = await Codec.fromLive(t);
        if (theme && [...el.themeSel.options].some((o) => o.value === theme) && theme !== S.settings.theme) App.setTheme(theme, false);
        Editor.setCode(code, { fit: true });
        Shell.toast('Loaded the diagram from the mermaid.live link');
        return true;
      }
      const code = this.extractMarkdown(t) ?? t;
      Editor.setCode(code, { fit: true });
      return true;
    } catch (err) {
      Shell.toast(`Could not import: ${err.message || err}`);
      return false;
    }
  },
  extractMarkdown(t) {
    const m = String(t).match(/```\s*mermaid[^\n]*\n([\s\S]*?)```/i);
    return m ? m[1].replace(/\n$/, '') : null;
  },
  async fromFile(file) {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['mmd', 'md', 'txt', 'mermaid', 'markdown'].includes(ext)) { Shell.toast('Drop a .mmd, .md or .txt file'); return; }
    const text = await file.text();
    if (ext === 'md' || ext === 'markdown') {
      const code = this.extractMarkdown(text);
      if (code == null) { Shell.toast(`${file.name} has no \`\`\`mermaid block`); return; }
      Editor.setCode(code, { fit: true });
    } else Editor.setCode(text, { fit: true });
    Shell.toast(`Loaded ${file.name}`);
  },
};

/* ===================== Export ===================== */
const Exporter = {
  async svgString(opts = {}) {
    let svg;
    if (opts.live && S.svg) {
      svg = S.svg.cloneNode(true);
      svg.querySelectorAll('.swv-hit').forEach((n) => n.remove());
    } else {
      const d = new DOMParser().parseFromString(S.cleanSvg, 'image/svg+xml');
      svg = document.importNode(d.documentElement, true);
    }
    svg.setAttribute('xmlns', SVGNS);
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.setAttribute('width', S.W);
    svg.setAttribute('height', S.H);
    svg.style.backgroundColor = S.themeBg;
    const usesRecursive = /Recursive/.test(S.cleanSvg);
    if (usesRecursive) {
      const { css, ok } = await Fonts.embedCss(svg.textContent + ' ');
      if (css) {
        const st = document.createElementNS(SVGNS, 'style');
        st.textContent = css;
        svg.insertBefore(st, svg.firstChild);
      }
      if (!ok && !this.warnedFont) { this.warnedFont = true; Shell.toast('The font could not be embedded here, so the file may use a fallback font.'); }
    }
    return new XMLSerializer().serializeToString(svg);
  },
  /** Draws an SVG string onto a canvas; lowers the scale if the canvas would be too big for the browser. */
  async raster(svgStr, scale) {
    const maxSide = 16000, maxArea = 120e6;
    let s = scale;
    while (s > 0.25 && (S.W * s > maxSide || S.H * s > maxSide || S.W * S.H * s * s > maxArea)) s *= 0.8;
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = Math.round(S.W * s);
      c.height = Math.round(S.H * s);
      const ctx = c.getContext('2d');
      ctx.fillStyle = S.themeBg;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return { canvas: c, scale: s };
    } finally { URL.revokeObjectURL(url); }
  },
  blob(canvas, type = 'image/png', q) { return new Promise((r) => canvas.toBlob(r, type, q)); },
  ready() {
    if (!S.cleanSvg) { Shell.toast('Nothing to export yet'); return false; }
    return true;
  },
  async svg() { if (!this.ready()) return; await Files.save(Files.base() + '.svg', await this.svgString(), 'image/svg+xml'); },
  async png(scale) {
    if (!this.ready()) return;
    const { canvas, scale: s } = await this.raster(await this.svgString(), scale);
    if (s < scale) Shell.toast(`The diagram is large, so the PNG uses ${s.toFixed(1)}×`);
    await Files.save(Files.base() + '.png', await this.blob(canvas), 'image/png');
  },
  async stepImage() {
    if (!this.ready()) return;
    const k = Camera.k;
    const { w, h } = Camera.size();
    const { canvas, scale } = await this.raster(await this.svgString({ live: true }), Math.max(1, Math.min(4, k * 2)));
    const x0 = clamp(-Camera.x / k, 0, S.W), y0 = clamp(-Camera.y / k, 0, S.H);
    const x1 = clamp((w - Camera.x) / k, 0, S.W), y1 = clamp((h - Camera.y) / k, 0, S.H);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round((x1 - x0) * scale));
    out.height = Math.max(1, Math.round((y1 - y0) * scale));
    const ctx = out.getContext('2d');
    ctx.fillStyle = S.themeBg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, x0 * scale, y0 * scale, out.width, out.height, 0, 0, out.width, out.height);
    if (Header.visible && S.geo) {
      // The pinned header sits at Header.top on screen, which is the top of this crop.
      const g = S.geo;
      const top = (Header.top / k) * scale;
      const hh = g.hdrH * scale;
      ctx.fillStyle = S.themeBg;
      ctx.fillRect(0, top, out.width, hh);
      ctx.drawImage(canvas, x0 * scale, g.hdrTop * scale, out.width, hh, 0, top, out.width, hh);
    }
    const n = S.cur >= 0 ? `step ${S.cur + 1}` : 'overview';
    await Files.save(`${Files.base()} - ${n}.png`, await this.blob(out), 'image/png');
  },
  async mmd() { await Files.save(Files.base() + '.mmd', el.code.value, 'text/plain'); },
  /** The sequence-walkthrough skill (folder and upload zip) with its setup guide, bundled into the page by build.py. */
  async skillKit() { await Files.save(SKILL_KIT.name, Uint8Array.from(atob(SKILL_KIT.b64), (c) => c.charCodeAt(0)), 'application/zip'); },
  async csv(includeNotes) {
    if (!S.flow?.isSequence) { Shell.toast('The step table works with sequence diagrams'); return; }
    await Files.save(Files.base() + '.csv', Table.csv(includeNotes), 'text/csv');
  },
  async markdown(includeNotes) {
    if (!S.flow?.isSequence) { Shell.toast('The step table works with sequence diagrams'); return; }
    await Files.copy(Table.markdown(includeNotes), 'Copied the step table as Markdown');
  },
  async notes() { await Files.save(`${Files.base()} notes.json`, JSON.stringify(Notes.exportObj(), null, 2), 'application/json'); },
  async liveOpen() {
    const link = await Codec.liveLink(el.code.value);
    const a = document.createElement('a');
    a.href = link; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(a); a.click(); a.remove();
  },
  async liveCopy() { await Files.copy(await Codec.liveLink(el.code.value), 'Copied the mermaid.live link'); },
  async share(withStep) {
    let frag = '#z.' + Codec.b64url(await Codec.deflate(el.code.value));
    if (withStep && S.cur >= 0) frag += '&step=' + (S.cur + 1);
    const what = withStep && S.cur >= 0 ? `a viewer link that opens on step ${S.cur + 1}` : 'a viewer link with the code inside';
    if (window.claude) {
      await Files.copy(frag, `Copied the code fragment for ${what}. Add it to the end of this page's link.`);
    } else {
      await Files.copy(location.href.split('#')[0] + frag, 'Copied ' + what);
    }
  },

  /* ---------- PDF ---------- */
  pdfPlan(opts) {
    const page = opts.size === 'letter' ? { w: 279.4, h: 215.9 } : { w: 297, h: 210 };
    const margin = 10, titleH = 9, footH = 6;
    const cw = page.w - 2 * margin, ch = page.h - 2 * margin - titleH - footH;
    const mm = Math.min(cw / S.W, 0.4); // mm per diagram px
    const g = S.flow?.isSequence ? S.geo : null;
    const hdrH = g ? g.hdrH : 0;
    // Safe places to cut: gaps between arrows, so labels are never split.
    const cuts = S.dom.map((d, i) => { const nx = S.dom[i + 1]; return nx ? (d.box.y + d.box.h + nx.box.y) / 2 : null; }).filter((v) => v != null).sort((a, b) => a - b);
    const slices = [];
    let y = 0;
    while (y < S.H - 0.5) {
      const room = ch / mm - (slices.length && g ? hdrH : 0);
      let end = Math.min(S.H, y + room);
      if (end < S.H) {
        const c = cuts.filter((v) => v > y + room * 0.4 && v <= end);
        if (c.length) end = c[c.length - 1];
      }
      slices.push([y, end]);
      y = end;
    }
    return { page, margin, titleH, footH, cw, ch, mm, slices, hdr: g ? [g.hdrTop, hdrH] : null };
  },
  async pdf(opts) {
    if (!this.ready()) return;
    Shell.toast('Making the PDF…');
    await loadScript(JSPDF_URLS, () => window.jspdf && window.jspdf.jsPDF);
    const { jsPDF } = window.jspdf;
    const plan = this.pdfPlan(opts);
    const { canvas, scale } = await this.raster(await this.svgString(), 2);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: opts.size === 'letter' ? 'letter' : 'a4', compress: true });
    const title = S.flow?.title || DEFAULT_TITLE;
    const tablePages = S.flow?.isSequence && opts.table ? this.pdfTablePages(plan, opts.notes) : [];
    const total = plan.slices.length + tablePages.length;
    const pages = [];
    const label = (txt, pageNo) => {
      const c = document.createElement('canvas');
      const pxmm = 6;
      c.width = Math.round(plan.cw * pxmm); c.height = Math.round(plan.titleH * pxmm);
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#161d29'; x.font = `700 ${4.2 * pxmm}px Recursive, sans-serif`; x.textBaseline = 'middle';
      x.fillText(txt, 0, c.height / 2);
      x.fillStyle = '#566072'; x.font = `500 ${3.2 * pxmm}px Recursive, sans-serif`; x.textAlign = 'right';
      x.fillText(`Page ${pageNo} of ${total}`, c.width, c.height / 2);
      return c;
    };
    plan.slices.forEach(([y0, y1], i) => {
      if (i) doc.addPage();
      const withHdr = i > 0 && plan.hdr;
      const hh = withHdr ? plan.hdr[1] : 0;
      const pc = document.createElement('canvas');
      pc.width = canvas.width;
      pc.height = Math.max(1, Math.round((hh + y1 - y0) * scale));
      const x = pc.getContext('2d');
      x.fillStyle = S.themeBg; x.fillRect(0, 0, pc.width, pc.height);
      if (withHdr) {
        x.drawImage(canvas, 0, plan.hdr[0] * scale, canvas.width, hh * scale, 0, 0, pc.width, hh * scale);
        x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, hh * scale - 2, pc.width, 2);
      }
      x.drawImage(canvas, 0, y0 * scale, canvas.width, (y1 - y0) * scale, 0, hh * scale, pc.width, (y1 - y0) * scale);
      const lab = label(title + (i ? ' (continued)' : ''), i + 1);
      doc.addImage(lab, 'PNG', plan.margin, plan.margin, plan.cw, plan.titleH, undefined, 'FAST');
      doc.addImage(pc, 'PNG', plan.margin, plan.margin + plan.titleH, S.W * plan.mm, (hh + y1 - y0) * plan.mm, undefined, 'FAST');
      pages.push(pc);
    });
    tablePages.forEach((tc, j) => {
      doc.addPage();
      const pno = plan.slices.length + j + 1;
      doc.addImage(label(title + ' – steps', pno), 'PNG', plan.margin, plan.margin, plan.cw, plan.titleH, undefined, 'FAST');
      doc.addImage(tc, 'PNG', plan.margin, plan.margin + plan.titleH, plan.cw, plan.ch, undefined, 'FAST');
      pages.push(tc);
    });
    App.debug.lastPdf = { pages: total, diagramPages: plan.slices.length, tablePages: tablePages.length, preview: pages.slice(0, 3).map((c) => c.toDataURL('image/png')) };
    await Files.save(Files.base() + '.pdf', doc.output('blob'), 'application/pdf');
  },
  /** Step table drawn on canvas pages, so any character in the flow prints correctly. */
  pdfTablePages(plan, withNotes) {
    const pxmm = 3.6, u = 2.5; // 11px text prints at about 9 pt; drawn at 2.5x for sharp print
    const W = Math.round(plan.cw * pxmm), H = Math.round(plan.ch * pxmm);
    const f = S.flow;
    const cols = [{ k: 'n', w: 0.05 }, { k: 'route', w: 0.2 }, { k: 'sends', w: 0.27 }, { k: 'does', w: withNotes ? 0.3 : 0.48 }];
    if (withNotes) cols.push({ k: 'note', w: 0.18 });
    const pages = [];
    let c, x, y;
    const newPage = () => {
      c = document.createElement('canvas'); c.width = Math.round(W * u); c.height = Math.round(H * u);
      x = c.getContext('2d'); x.scale(u, u); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.textBaseline = 'top';
      y = 0;
      x.font = `700 ${11}px Recursive, sans-serif`; x.fillStyle = '#566072';
      let cx = 0;
      for (const col of cols) { x.fillText({ n: '#', route: 'From → To', sends: 'Sends', does: 'Does', note: 'Your note' }[col.k], cx + 4, y + 4); cx += col.w * W; }
      y += 22;
      x.fillStyle = '#d5dbe3'; x.fillRect(0, y - 3, W, 1);
      pages.push(c);
    };
    const wrap = (text, width, font) => {
      x.font = font;
      const out = [];
      for (const para of String(text || '').split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/)) {
          const t = line ? line + ' ' + word : word;
          if (x.measureText(t).width > width && line) { out.push(line); line = word; } else line = t;
        }
        out.push(line);
      }
      return out;
    };
    newPage();
    let sec = -2;
    for (const s of f.steps) {
      if (f.sections.length && s.section !== sec) {
        sec = s.section;
        if (y + 40 > H) newPage();
        x.font = '750 13px Recursive, sans-serif'; x.fillStyle = '#161d29';
        x.fillText(f.sections[sec]?.name || '', 4, y + 6);
        y += 24;
      }
      const e = Notes.entry(s) || {};
      const cells = {
        n: [{ t: String(s.n), f: '600 11px Recursive, sans-serif' }],
        route: [{ t: route(s), f: '600 11px Recursive, sans-serif' }, { t: s.kind + (s.branch.length ? ' · ' + s.branch.map((b) => b.kind + ' ' + b.label).join(' > ') : ''), f: '400 10px Recursive, sans-serif', c: '#566072' }],
        sends: [{ t: s.label.join('\n'), f: '400 10.5px "Cascadia Mono", Consolas, monospace' }],
        does: [{ t: s.explain || 'No explanation', f: '400 11px Recursive, sans-serif', c: s.explain ? '#161d29' : '#8a93a3' }, ...(s.payload ? [{ t: 'Payload: ' + s.payload, f: '400 10px "Cascadia Mono", Consolas, monospace', c: '#566072' }] : []), ...(s.refs.length ? [{ t: s.refs.join('  '), f: '400 10px "Cascadia Mono", Consolas, monospace', c: '#566072' }] : [])],
        note: [{ t: (e.star ? '★ ' : '') + (e.note || ''), f: '400 11px Recursive, sans-serif' }],
      };
      const laid = cols.map((col) => (cells[col.k] || []).map((p) => ({ ...p, lines: wrap(p.t, col.w * W - 10, p.f) })));
      const rowH = Math.max(...laid.map((ps) => ps.reduce((a, p) => a + p.lines.length * 15 + 2, 0))) + 10;
      if (y + rowH > H) newPage();
      let cx = 0;
      laid.forEach((ps, i) => {
        let cy = y + 5;
        for (const p of ps) {
          x.font = p.f; x.fillStyle = p.c || '#161d29';
          for (const ln of p.lines) { x.fillText(ln, cx + 4, cy); cy += 15; }
          cy += 2;
        }
        cx += cols[i].w * W;
      });
      y += rowH;
      x.fillStyle = '#e6e9ee'; x.fillRect(0, y - 2, W, 1);
    }
    return pages;
  },
};

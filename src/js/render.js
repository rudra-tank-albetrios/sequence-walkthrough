/* ===================== App state ===================== */
const S = {
  code: '', ann: null, flow: null, svg: null, cleanSvg: '', svgId: '', vb: null, W: 0, H: 0,
  geo: null, dom: [], cur: -1, view: 'diagram', renderSeq: 0, rendered: false, error: null,
  themeBg: '#ffffff', themeDark: false,
  settings: Object.assign({ theme: 'redux-color', wheel: 'scroll', dim: false, grid: true, speed: 3000, bands: true }, Store.get('swv:settings', {})),
  codeOpen: false, hide: false, noteOpen: false, playing: false, enteredFs: false, chapterLock: false, insightOpen: false,
};
const saveSettings = () => Store.set('swv:settings', S.settings);

const el = {};
['app', 'topbar', 'flowName', 'flowMeta', 'flowBadge', 'canvas', 'layer', 'hdrBand', 'hdrLayer', 'loading', 'notice', 'errBadge',
  'codeBtn', 'codeCount', 'playBtn', 'playIcon', 'playLbl', 'speedSel', 'dimBtn', 'bandBtn', 'hideBtn', 'showCtrls', 'tip', 'codePanel',
  'gutter', 'edHl', 'code', 'edStatus', 'lintList', 'tableView', 'tvBody', 'tvScroll', 'tv', 'chapters', 'followStrip', 'bmBtn',
  'cards', 'cardPrev', 'cardCur', 'cardNext', 'prevBtn', 'nextBtn', 'live', 'zoomPct', 'wheelBtn', 'themeSel', 'themeSel2',
  'viewDiagram', 'viewTable', 'findPop', 'findInput', 'findCount', 'exportBtn', 'exportMenu', 'moreBtn', 'moreMenu', 'gridBtn',
  'wbar', 'edgeTop', 'edgeBottom', 'edgeLeft', 'progress', 'pathSel', 'behindBtn', 'presentCard',
  'insightBtn', 'insightPanel', 'insightTabs', 'insightBody', 'insightClose',
].forEach((id) => { el[id] = document.getElementById(id); });

/* ===================== Fonts ===================== */
/* The redux themes name the font "Recursive Variable". Google serves it as "Recursive", so the same files are
   registered again under the theme's name before Mermaid measures any text. */
const Fonts = {
  faces: [], cache: {}, aliased: false,
  async init() {
    const link = document.getElementById('swv-font-css');
    if (!link) return;
    const loaded = () => { try { return link.sheet && link.sheet.cssRules.length > 0; } catch { return false; } };
    for (let t = 0; t < 60 && !loaded(); t++) await sleep(50);
    let rules = [];
    try { rules = [...link.sheet.cssRules]; } catch { rules = []; }
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const fam = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      if (fam !== 'Recursive') continue;
      const url = (r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)/) || [])[1];
      if (!url) continue;
      const desc = {
        weight: r.style.getPropertyValue('font-weight') || '300 1000',
        style: r.style.getPropertyValue('font-style') || 'normal',
        unicodeRange: r.style.getPropertyValue('unicode-range') || 'U+0-10FFFF',
      };
      try {
        document.fonts.add(new FontFace('Recursive Variable', `url(${url}) format("woff2")`, desc));
        this.faces.push({ url, ...desc, ranges: parseRanges(desc.unicodeRange) });
      } catch { /* ignore a bad face */ }
    }
    this.aliased = this.faces.length > 0;
    await this.ensure('Aa0 ₹');
  },
  /** Loads the faces that cover the characters in text before Mermaid measures it. */
  async ensure(text) {
    if (!this.aliased) return;
    const sample = [...new Set(String(text))].join('').slice(0, 4000) || 'A';
    await Promise.race([
      Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 16px "Recursive Variable"`, sample).catch(() => null))),
      sleep(4000),
    ]);
  },
  /** @font-face rules with the font files inlined, for exported SVG and PNG files. */
  async embedCss(text) {
    if (!this.aliased) return { css: '', ok: false };
    const chars = [...new Set(String(text))].map((c) => c.codePointAt(0));
    const need = this.faces.filter((f) => chars.some((cp) => f.ranges.some(([a, b]) => cp >= a && cp <= b)));
    let css = '';
    let ok = true;
    for (const f of need) {
      try {
        if (!this.cache[f.url]) {
          const inline = /^data:[^,]*;base64,/.exec(f.url);
          if (inline) this.cache[f.url] = f.url.slice(inline[0].length);
          else this.cache[f.url] = b64(new Uint8Array(await (await fetch(f.url, { mode: 'cors' })).arrayBuffer()));
        }
        css += `@font-face{font-family:"Recursive Variable";font-style:${f.style};font-weight:${f.weight};unicode-range:${f.unicodeRange};src:url(data:font/woff2;base64,${this.cache[f.url]}) format("woff2");}\n`;
      } catch { ok = false; }
    }
    return { css, ok };
  },
};
function parseRanges(s) {
  return String(s).split(',').map((p) => p.trim().replace(/^U\+/i, '')).filter(Boolean).map((p) => {
    if (p.includes('?')) return [parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'F'), 16)];
    const [a, b] = p.split('-');
    return [parseInt(a, 16), parseInt(b || a, 16)];
  });
}
function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ===================== Camera ===================== */
const Camera = {
  x: 0, y: 0, k: 1, anim: 0,
  size() { return { w: el.canvas.clientWidth, h: el.canvas.clientHeight }; },
  apply() {
    el.layer.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.k})`;
    el.layer.classList.add('moving');
    el.hdrLayer.classList.add('moving');
    this.settle();
    el.zoomPct.textContent = Math.round(this.k * 100) + '%';
    if (S.settings.grid) {
      const g = 20 * this.k;
      el.canvas.style.backgroundSize = `${g}px ${g}px`;
      el.canvas.style.backgroundPosition = `${this.x}px ${this.y}px`;
    }
    Header.sync();
    Tip.hide();
  },
  settle: debounce(() => { el.layer.classList.remove('moving'); el.hdrLayer.classList.remove('moving'); }, 180),
  clampPos() {
    const { w, h } = this.size();
    const m = 60;
    const dw = S.W * this.k, dh = S.H * this.k;
    this.x = clamp(this.x, Math.min(m - dw, w - m), Math.max(w - m, m - dw));
    this.y = clamp(this.y, Math.min(m - dh, h - m), Math.max(h - m, m - dh));
  },
  set(x, y, k) {
    cancelAnimationFrame(this.anim);
    this.k = clamp(k ?? this.k, 0.1, 8);
    this.x = x; this.y = y;
    this.clampPos();
    this.apply();
  },
  zoomAt(px, py, f) {
    const k2 = clamp(this.k * f, 0.1, 8);
    const r = k2 / this.k;
    this.set(px - (px - this.x) * r, py - (py - this.y) * r, k2);
  },
  zoomCenter(f) { const { w, h } = this.size(); this.zoomAt(w / 2, h / 2, f); },
  zoomTo(k) { const { w, h } = this.size(); this.zoomAt(w / 2, h / 2, k / this.k); },
  panBy(dx, dy) { this.set(this.x + dx, this.y + dy); },
  insetLeft() { return S.codeOpen && !isNarrow() ? el.codePanel.offsetWidth : 0; },
  fitWidth() {
    if (!S.W) return;
    const { w } = this.size();
    const left = this.insetLeft();
    const k = clamp((w - left - 48) / S.W, 0.1, 8);
    this.set(left + (w - left - S.W * k) / 2, 24, k);
  },
  fitAll() {
    if (!S.W) return;
    const { w, h } = this.size();
    const left = this.insetLeft();
    const k = clamp(Math.min((w - left - 48) / S.W, (h - 48) / S.H), 0.1, 8);
    this.set(left + (w - left - S.W * k) / 2, (h - S.H * k) / 2, k);
  },
  initial() {
    if (!S.W) return;
    const { w } = this.size();
    const k = clamp(Math.min(1, (w - 48) / S.W), 0.1, 1);
    this.set((w - S.W * k) / 2, 24, k);
  },
  glideTo(x, y, ms = 320) {
    cancelAnimationFrame(this.anim);
    if (reducedMotion() || ms <= 0) { this.set(x, y, this.k); return; }
    const x0 = this.x, y0 = this.y, t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      this.x = x0 + (x - x0) * e; this.y = y0 + (y - y0) * e;
      this.clampPos();
      this.apply();
      if (p < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  },
  /** Visible area for the follow camera: canvas minus pinned header, open code panel and a 24 px margin. */
  visible() {
    const { w, h } = this.size();
    const top = (S.geo && S.flow?.isSequence ? S.geo.hdrH * this.k : 0) + 12;
    const left = this.insetLeft() + 12;
    return { x0: left, y0: top, x1: w - 12, y1: h - 56, w: w - 12 - left, h: h - 56 - top };
  },
  followStep(step, ms = 320) {
    const b = step && S.dom[step.idx]?.box;
    if (!b) return;
    const v = this.visible();
    const k = this.k;
    const sx = this.x + b.x * k, sy = this.y + b.y * k, sw = b.w * k, sh = b.h * k;
    if (sx >= v.x0 && sy >= v.y0 && sx + sw <= v.x1 && sy + sh <= v.y1) return;
    let nx = this.x, ny = this.y;
    if (sw <= v.w && sh <= v.h) {
      ny = v.y0 + 0.4 * v.h - (b.y + b.h / 2) * k;
      // A tall arrow may not sit at 40%: keep all of it inside the visible area.
      ny = clamp(ny, v.y1 - (b.y + b.h) * k, v.y0 - b.y * k);
      if (sx < v.x0 || sx + sw > v.x1) nx = v.x0 + v.w / 2 - (b.x + b.w / 2) * k;
    } else {
      const lb = S.dom[step.idx].labelBox || b;
      nx = v.x0 + v.w / 2 - (lb.x + lb.w / 2) * k;
      ny = v.y0 + v.h / 2 - (lb.y + lb.h / 2) * k;
    }
    this.glideTo(nx, ny, ms);
  },
};

/* ===================== Renderer ===================== */
const Renderer = {
  mermaidReady: false,
  configure() {
    mermaid.initialize({ startOnLoad: false, theme: S.settings.theme, securityLevel: 'strict' });
    try {
      const tv = mermaid.mermaidAPI.getConfig().themeVariables || {};
      S.themeBg = tv.background && tv.background !== 'transparent' ? tv.background : (/dark/.test(S.settings.theme) ? '#1e1e1e' : '#ffffff');
    } catch { S.themeBg = '#ffffff'; }
    S.themeDark = luminance(S.themeBg) < 0.4;
    el.canvas.style.backgroundColor = S.themeBg;
    el.canvas.style.setProperty('--grid-dot', S.themeDark ? 'rgba(220,225,235,.22)' : 'rgba(90,100,120,.28)');
  },
  async render(code, opts = {}) {
    if (!this.mermaidReady) { S.code = code; return; }
    const my = ++S.renderSeq;
    const t0 = performance.now();
    S.code = code;
    const ann = Annotations.parse(code);
    await Fonts.ensure(code);
    if (my !== S.renderSeq) return;
    let info = null;
    try {
      await mermaid.parse(code);
    } catch (err) {
      if (my === S.renderSeq) this.fail(err, code, ann);
      return;
    }
    try {
      if (/^sequenceDiagram$/i.test(ann.diagramType) && mermaid.mermaidAPI.getDiagramFromText) {
        info = mermaidInfo(await mermaid.mermaidAPI.getDiagramFromText(code));
      }
    } catch { info = null; }
    let out;
    const id = 'swv' + my;
    try {
      out = await mermaid.render(id, code);
    } catch (err) {
      document.getElementById('d' + id)?.remove();
      if (my === S.renderSeq) this.fail(err, code, ann);
      return;
    }
    if (my !== S.renderSeq) return; // a newer render started; drop this one
    const flow = buildFlow(ann, info);
    this.mount(out.svg, id, flow, ann);
    S.error = null;
    el.errBadge.hidden = true;
    Editor.setError(null);
    const first = !S.rendered;
    S.rendered = true;
    el.loading.hidden = true;
    if (first || opts.fit) Camera.initial(); else { Camera.clampPos(); Camera.apply(); }
    S.lastRenderMs = performance.now() - t0;
    App.afterRender(first);
  },
  fail(err, code, ann) {
    const msg = String(err?.message || err?.str || err || 'Syntax error');
    const m = msg.match(/line\s+(\d+)/i);
    const line = m ? mermaidLineToCode(code, +m[1]) : -1;
    S.error = { msg, line };
    Editor.setError(S.error);
    el.loading.hidden = true;
    const short = msg.split('\n')[0].replace(/^Error:\s*/, '').slice(0, 140);
    el.errBadge.innerHTML = S.rendered
      ? `<b>Syntax error${line >= 0 ? ' on line ' + (line + 1) : ''}.</b> Showing the last good diagram. <span class="mono">${esc(short)}</span>`
      : `<b>Syntax error${line >= 0 ? ' on line ' + (line + 1) : ''}.</b> <span class="mono">${esc(short)}</span>`;
    el.errBadge.hidden = false;
    App.updateCodeCount();
  },
  mount(svgText, id, flow, ann) {
    const tmp = document.createElement('div');
    tmp.innerHTML = svgText;
    const svg = tmp.querySelector('svg');
    const vbA = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    let vb;
    if (vbA.length === 4 && vbA[2] > 0) vb = { x: vbA[0], y: vbA[1], w: vbA[2], h: vbA[3] };
    else {
      const w = parseFloat(svg.getAttribute('width')) || 800, h = parseFloat(svg.getAttribute('height')) || 600;
      vb = { x: 0, y: 0, w, h };
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
    svg.removeAttribute('style');
    svg.setAttribute('width', vb.w);
    svg.setAttribute('height', vb.h);
    S.cleanSvg = svg.outerHTML;
    S.svg = svg; S.svgId = id; S.vb = vb; S.W = vb.w; S.H = vb.h;
    S.ann = ann; S.flow = flow;
    el.layer.replaceChildren(svg);
    S.dom = [];
    S.geo = null;
    el.hdrLayer.replaceChildren();
    if (flow.isSequence) {
      Mapper.tag(svg, flow);
      Mapper.measure(svg, flow);
      Header.build(svg, id);
      Mapper.addHits(svg);
    }
  },
};
function luminance(color) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = '#000'; c.fillStyle = color;
  const hex = c.fillStyle;
  if (!/^#/.test(hex)) return 1;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
/** Mermaid strips front matter, comment lines and the blank lines just above a comment
    (its /^\s*%%.../gm also eats preceding newlines) before parsing, so its line numbers skip them. */
function mermaidLineToCode(code, n) {
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  let start = 0;
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trim() === '---') {
    for (let j = i + 1; j < lines.length; j++) if (lines[j].trim() === '---') { start = j + 1; break; }
  }
  const removed = new Set();
  for (let j = start; j < lines.length; j++) {
    if (!/^\s*%%(?!\{)./.test(lines[j])) continue;
    removed.add(j);
    for (let b = j - 1; b >= start && !lines[b].trim() && !removed.has(b); b--) removed.add(b);
  }
  const kept = [];
  for (let j = start; j < lines.length; j++) if (!removed.has(j)) kept.push(j);
  const blank = (l) => !l.trim() || /^\s*%%\{.*\}%%\s*$/.test(l);
  while (kept.length && blank(lines[kept[0]])) kept.shift();
  return kept[n - 1] ?? lines.length - 1;
}

/* ===================== Mapper: arrow N in code = drawn arrow N ===================== */
const Mapper = {
  tag(svg, flow) {
    const nodes = svg.querySelectorAll('.messageText, .messageLine0, .messageLine1, .sequenceNumber');
    const dom = [];
    let texts = [];
    for (const n of nodes) {
      const c = n.classList;
      if (c.contains('messageText')) texts.push(n);
      else if (c.contains('messageLine0') || c.contains('messageLine1')) { dom.push({ line: n, texts, num: null }); texts = []; }
      else if (c.contains('sequenceNumber') && dom.length && !dom[dom.length - 1].num) dom[dom.length - 1].num = n;
    }
    if (dom.length !== flow.steps.length) {
      flow.lint.push({ line: 0, msg: `Mermaid drew ${dom.length} arrows but ${flow.steps.length} were read; highlights may be off`, code: 'dom-mismatch' });
    }
    dom.length = Math.min(dom.length, flow.steps.length);
    dom.forEach((d, i) => {
      for (const e of [d.line, ...d.texts, d.num]) if (e) e.setAttribute('data-step', i);
    });
    // Participants
    for (const p of flow.participants) {
      for (const pos of ['top', 'bottom']) {
        const e = svg.querySelector(`.actor-${pos}[name="${CSS.escape(p.alias)}"]`);
        if (!e) continue;
        const g = actorGroup(e);
        g.setAttribute('data-alias', p.alias);
        g.classList.add('swv-actor');
      }
    }
    S.dom = dom;
  },
  measure(svg, flow) {
    const inv = svg.getScreenCTM().inverse();
    const vb = S.vb;
    const box = (e) => {
      const b = e.getBBox();
      const m = inv.multiply(e.getScreenCTM());
      const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x: Math.min(...xs) - vb.x, y: Math.min(...ys) - vb.y, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    const union = (bs) => {
      bs = bs.filter(Boolean);
      if (!bs.length) return null;
      const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
      const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    for (const d of S.dom) {
      d.lineBox = box(d.line);
      d.labelBox = d.texts.length ? union(d.texts.map(box)) : null;
      d.numBox = d.num ? box(d.num) : null;
      d.box = union([d.lineBox, d.labelBox, d.numBox]);
      d.box = { x: d.box.x - 8, y: d.box.y - 8, w: d.box.w + 16, h: d.box.h + 16 };
    }
    const actors = {};
    let rowTop = Infinity, rowBottom = -Infinity, bottomTop = Infinity;
    for (const p of flow.participants) {
      const topEl = svg.querySelector(`.actor-top[name="${CSS.escape(p.alias)}"]`);
      const botEl = svg.querySelector(`.actor-bottom[name="${CSS.escape(p.alias)}"]`);
      if (topEl) {
        const b = box(actorGroup(topEl));
        actors[p.alias] = { top: b };
        rowTop = Math.min(rowTop, b.y);
        rowBottom = Math.max(rowBottom, b.y + b.h);
      }
      if (botEl) {
        const b = box(actorGroup(botEl));
        (actors[p.alias] ||= {}).bottom = b;
        bottomTop = Math.min(bottomTop, b.y);
      }
    }
    if (!isFinite(rowTop)) { rowTop = 0; rowBottom = 0; }
    S.geo = { actors, rowTop, rowBottom, bottomTop: isFinite(bottomTop) ? bottomTop : S.H, hdrTop: rowTop - 6, hdrH: rowBottom - rowTop + 12 };
  },
  addHits(svg) {
    for (const [i, d] of S.dom.entries()) {
      const h = d.line.cloneNode(false);
      h.removeAttribute('class'); h.removeAttribute('marker-end'); h.removeAttribute('marker-start'); h.removeAttribute('id');
      h.setAttribute('class', 'swv-hit');
      h.setAttribute('data-step', i);
      h.setAttribute('style', 'stroke: transparent; stroke-width: 16px; fill: none; pointer-events: stroke');
      d.line.after(h);
      if (d.texts.length) {
        const bs = d.texts.map((t) => t.getBBox());
        const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
        const x1 = Math.max(...bs.map((b) => b.x + b.width)), y1 = Math.max(...bs.map((b) => b.y + b.height));
        const r = document.createElementNS(SVGNS, 'rect');
        r.setAttribute('x', x0 - 4); r.setAttribute('y', y0 - 2); r.setAttribute('width', x1 - x0 + 8); r.setAttribute('height', y1 - y0 + 4);
        r.setAttribute('class', 'swv-hit');
        r.setAttribute('data-step', i);
        r.setAttribute('style', 'fill: transparent; pointer-events: all');
        h.after(r);
        d.hitLabel = r;
      }
      d.hitLine = h;
    }
  },
};
function actorGroup(e) {
  if (e.tagName.toLowerCase() === 'g') return e;
  let g = e.parentNode;
  while (g && g.tagName && g.tagName.toLowerCase() === 'g' && !g.querySelector('text') && g.parentNode) g = g.parentNode;
  return g || e;
}
/** Local (parent) coordinates of an element's centre, for overlays drawn as siblings. */
function localCenter(e) { const b = e.getBBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
function lineStart(line) {
  if (line.tagName.toLowerCase() === 'line') return { x: +line.getAttribute('x1'), y: +line.getAttribute('y1') };
  const m = (line.getAttribute('d') || '').match(/M\s*([-\d.]+)[ ,]+([-\d.]+)/i);
  return m ? { x: +m[1], y: +m[2] } : localCenter(line);
}
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/* ===================== Sticky participant header ===================== */
const Header = {
  svg: null, visible: false, top: 0,
  build(svg, id) {
    const g = S.geo;
    if (!g || !(g.rowBottom > g.rowTop)) { this.svg = null; return; }
    const vb = S.vb;
    const hs = svg.cloneNode(false);
    hs.setAttribute('id', id + '-hdr');
    hs.setAttribute('viewBox', `${vb.x} ${vb.y + g.hdrTop} ${vb.w} ${g.hdrH}`);
    hs.setAttribute('width', vb.w);
    hs.setAttribute('height', g.hdrH);
    hs.setAttribute('aria-hidden', 'true');
    hs.removeAttribute('aria-labelledby'); hs.removeAttribute('aria-describedby');
    const idRe = new RegExp('#' + id + '(?![\\w-])', 'g');
    for (const st of svg.querySelectorAll('style')) {
      const c = st.cloneNode(true);
      c.textContent = c.textContent.replace(idRe, '#' + id + '-hdr');
      hs.appendChild(c);
    }
    const halo = svgEl('g', { class: 'swv-halos' });
    hs.appendChild(halo);
    const inv = svg.getScreenCTM().inverse();
    for (const p of S.flow.participants) {
      const t = svg.querySelector(`.actor-top[name="${CSS.escape(p.alias)}"]`);
      if (!t) continue;
      const grp = actorGroup(t);
      const m = inv.multiply(grp.parentNode.getScreenCTM());
      const wrap = svgEl('g', { transform: `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})` });
      const c = grp.cloneNode(true);
      c.setAttribute('data-alias', p.alias);
      c.classList.add('swv-actor');
      wrap.appendChild(c);
      hs.appendChild(wrap);
    }
    el.hdrLayer.replaceChildren(hs);
    el.hdrBand.style.background = S.themeBg;
    this.svg = hs;
    this.sync();
  },
  sync() {
    const g = S.geo;
    if (!this.svg || !g || S.view !== 'diagram' || !S.flow?.isSequence) return this.show(false);
    const k = Camera.k;
    const rowScreen = Camera.y + g.hdrTop * k;
    const hH = g.hdrH * k;
    if (rowScreen >= 0) return this.show(false);
    const endScreen = Camera.y + g.bottomTop * k;
    const top = Math.min(0, endScreen - hH - 4 * k);
    if (top + hH <= 0) return this.show(false);
    this.top = top;
    el.hdrLayer.style.transform = `translate(${Camera.x}px, ${top}px) scale(${k})`;
    el.hdrBand.style.top = top + 'px';
    el.hdrBand.style.height = hH + 'px';
    this.show(true);
  },
  show(on) {
    if (this.visible === on) return;
    this.visible = on;
    el.hdrLayer.hidden = !on;
    el.hdrBand.hidden = !on;
  },
  /** Yellow halo on the sender and receiver, in the pinned header and in the diagram's own top row. */
  setActive(aliases) {
    const list = [...new Set(aliases || [])];
    const halo = (x, y, w, h) => svgEl('rect', {
      class: 'swv-halo', x: x - 5, y: y - 5, width: w + 10, height: h + 10, rx: 9,
      style: `fill: ${S.themeDark ? '#ffd43b55' : '#ffd43b'}; fill-opacity: ${S.themeDark ? 1 : 0.55}; stroke: #f0b400; stroke-width: 2px; pointer-events: none`,
    });
    if (this.svg) {
      this.svg.querySelectorAll('.swv-halo').forEach((n) => n.remove());
      const layer = this.svg.querySelector('.swv-halos');
      for (const a of list) {
        const b = S.geo.actors[a]?.top;
        if (b) layer.appendChild(halo(b.x + S.vb.x, b.y + S.vb.y, b.w, b.h));
      }
    }
    if (S.svg) {
      S.svg.querySelectorAll('.swv-halo').forEach((n) => n.remove());
      for (const a of list) {
        for (const pos of ['top', 'bottom']) {
          const t = S.svg.querySelector(`.actor-${pos}[name="${CSS.escape(a)}"]`);
          if (!t) continue;
          const grp = actorGroup(t);
          const b = grp.getBBox();
          grp.before(halo(b.x, b.y, b.width, b.height));
        }
      }
    }
  },
};

/* ===================== Highlighter ===================== */
const Hl = {
  overlays: [], curEls: [],
  apply(i) {
    this.overlays.forEach((n) => n.remove());
    this.overlays = [];
    this.curEls.forEach((n) => n.classList.remove('swv-cur'));
    this.curEls = [];
    const svg = S.svg;
    if (!svg || !S.flow?.isSequence) return;
    svg.classList.toggle('swv-dim', !!S.settings.dim && i >= 0);
    this.chapter(i);
    const d = S.dom[i];
    if (!d) { Header.setActive(null); return; }
    const dark = S.themeDark;
    // Dashed rings on the steps paired with this one: the replies of a request, or the request a reply answers.
    const s0 = S.flow.steps[i];
    const paired = s0.kind === 'reply' && s0.answers >= 0 ? [s0.answers] : s0.replies;
    for (const j of paired) {
      const pd = S.dom[j];
      if (!pd) continue;
      const pc = pd.num ? localCenter(pd.num) : lineStart(pd.line);
      const ring = svgEl('circle', { class: 'swv-pair', cx: pc.x, cy: pc.y, r: 16, style: 'fill: none; stroke: #f0b400; stroke-width: 2px; stroke-dasharray: 4 3; pointer-events: none' });
      (pd.num || pd.line).after(ring);
      this.overlays.push(ring);
    }
    // Marker stroke under the arrow
    const mk = d.line.cloneNode(false);
    ['class', 'marker-end', 'marker-start', 'id', 'data-step'].forEach((a) => mk.removeAttribute(a));
    mk.setAttribute('style', `stroke: #ffd43b; stroke-opacity: ${dark ? 0.55 : 0.75}; stroke-width: 10px; stroke-linecap: round; stroke-dasharray: none; fill: none; pointer-events: none`);
    mk.setAttribute('class', 'swv-marker');
    d.line.before(mk);
    this.overlays.push(mk);
    // Label pill
    if (d.texts.length) {
      const bs = d.texts.map((t) => t.getBBox());
      const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
      const x1 = Math.max(...bs.map((b) => b.x + b.width)), y1 = Math.max(...bs.map((b) => b.y + b.height));
      const pill = svgEl('rect', {
        class: 'swv-pill', x: x0 - 6, y: y0 - 2, width: x1 - x0 + 12, height: y1 - y0 + 4, rx: 5,
        style: `fill: ${dark ? '#7a5c00' : '#ffe680'}; fill-opacity: ${dark ? 0.85 : 0.9}; pointer-events: none`,
      });
      d.texts[0].before(pill);
      this.overlays.push(pill);
    }
    // Number ring
    const c = d.num ? localCenter(d.num) : lineStart(d.line);
    const ring = svgEl('circle', { class: 'swv-ring', cx: c.x, cy: c.y, r: 13, style: 'fill: none; stroke: #f0b400; stroke-width: 3px; pointer-events: none' });
    (d.num || d.line).after(ring);
    this.overlays.push(ring);
    for (const e of [d.line, ...d.texts, d.num]) if (e) { e.classList.add('swv-cur'); this.curEls.push(e); }
    const s = S.flow.steps[i];
    Header.setActive([s.from, s.to]);
  },
  /** A light band in the chapter's colour behind the arrows of the current chapter, with start and end markers.
   *  Arrows of the other chapters fade a little, so the chapter's first, middle and last steps stand out. */
  chapter(i) {
    const svg = S.svg;
    svg.querySelectorAll('.swv-band, .swv-band-label').forEach((n) => n.remove());
    const f = S.flow;
    const s = f.steps[i];
    const sec = s && f.sections.length && S.settings.bands ? f.sections[s.section] : null;
    svg.classList.toggle('swv-chap', !!sec);
    for (const [k, d] of S.dom.entries()) {
      const out = !!sec && f.steps[k].section !== sec.idx;
      for (const e of [d.line, ...d.texts, d.num]) if (e) e.classList.toggle('swv-outch', out);
    }
    if (!sec) return;
    const boxes = S.dom.slice(sec.firstStep, sec.firstStep + sec.count).map((d) => d.box).filter(Boolean);
    if (!boxes.length) return;
    const y0 = Math.min(...boxes.map((b) => b.y)) - 6, y1 = Math.max(...boxes.map((b) => b.y + b.h)) + 6;
    const vb = S.vb;
    const dark = S.themeDark;
    const fill = dark ? `hsl(${sec.hue} 45% 28%)` : `hsl(${sec.hue} 85% 90%)`;
    const ink = dark ? `hsl(${sec.hue} 70% 80%)` : `hsl(${sec.hue} 60% 32%)`;
    const band = svgEl('rect', { class: 'swv-band', x: vb.x, y: vb.y + y0, width: vb.w, height: y1 - y0, rx: 6, style: `fill: ${fill}; fill-opacity: ${dark ? 0.55 : 0.6}; pointer-events: none` });
    const edge = svgEl('rect', { class: 'swv-band', x: vb.x + 2, y: vb.y + y0, width: 4, height: y1 - y0, rx: 2, style: `fill: ${ink}; fill-opacity: .8; pointer-events: none` });
    const label = (txt, y, anchor) => {
      const t = svgEl('text', { class: 'swv-band-label', x: vb.x + 12, y, style: `font: 600 11px Recursive, sans-serif; fill: ${ink}; pointer-events: none; dominant-baseline: ${anchor}` });
      t.textContent = txt;
      return t;
    };
    const first = svg.querySelector(':scope > :not(style):not(defs)');
    (first || svg).before(band);
    band.after(edge);
    svg.appendChild(label(`▶ ${sec.name} · ${sec.count === 1 ? '1 step' : sec.count + ' steps'}`, vb.y + y0 + 4, 'hanging'));
    if (y1 - y0 > 40) svg.appendChild(label(`■ end of ${sec.name}`, vb.y + y1 - 5, 'auto'));
  },
  /** Blue rings (Follow), stars (bookmarks), spotlight and path fading, trust boundaries. */
  decorate() {
    const svg = S.svg;
    if (!svg || !S.flow?.isSequence) return;
    svg.querySelectorAll('.swv-follow, .swv-star').forEach((n) => n.remove());
    this.boundaries();
    const follow = new Set(Follow.hits);
    for (const [i, d] of S.dom.entries()) {
      const c = d.num ? localCenter(d.num) : lineStart(d.line);
      if (follow.has(i)) {
        d.line.after(svgEl('circle', { class: 'swv-follow', cx: c.x, cy: c.y, r: 17, style: 'fill: none; stroke: #1d5bd0; stroke-width: 3px; pointer-events: none' }));
      }
      const e = Notes.entry(S.flow.steps[i]);
      if (e && (e.star || e.note)) {
        const t = svgEl('text', { class: 'swv-star', x: c.x - 22, y: c.y - 9, style: `font: 700 15px sans-serif; fill: ${e.star ? '#e0a800' : '#8a93a3'}; stroke: ${S.themeDark ? '#000' : '#fff'}; stroke-width: 3px; paint-order: stroke; pointer-events: none` });
        t.textContent = e.star ? '★' : '✎';
        (d.num || d.line).after(t);
      }
    }
    const spot = Spot.alias;
    svg.classList.toggle('swv-spot', !!spot);
    svg.classList.toggle('swv-path', Path.mode !== 'all');
    for (const [i, d] of S.dom.entries()) {
      const s = S.flow.steps[i];
      const out = !!spot && s.from !== spot && s.to !== spot;
      const off = !Path.visible(s);
      for (const e of [d.line, ...d.texts, d.num, d.hitLine, d.hitLabel]) if (e) { e.classList.toggle('swv-out', out); e.classList.toggle('swv-off', off); }
    }
  },
  /** Dotted vertical lines where neighbouring layers sit in different trust zones (needs kind= on the layers). */
  boundaries() {
    const svg = S.svg;
    svg.querySelectorAll('.swv-boundary').forEach((n) => n.remove());
    const f = S.flow, g = S.geo;
    if (!g || !f.boundaries.length) return;
    const dark = S.themeDark;
    for (const b of f.boundaries) {
      const L = g.actors[b.left]?.top, R = g.actors[b.right]?.top;
      if (!L || !R) continue;
      const x = S.vb.x + (L.x + L.w + R.x) / 2;
      const y0 = S.vb.y + g.rowBottom + 4, y1 = S.vb.y + g.bottomTop - 4;
      const line = svgEl('line', { class: 'swv-boundary', x1: x, y1: y0, x2: x, y2: y1, style: `stroke: ${dark ? '#9aa4b8' : '#6b7486'}; stroke-width: 1.5px; stroke-dasharray: 3 6; opacity: .7; pointer-events: none` });
      const t = svgEl('text', { class: 'swv-boundary', x: x + 4, y: y0 + 12, style: `font: 600 10px Recursive, sans-serif; fill: ${dark ? '#9aa4b8' : '#6b7486'}; pointer-events: none` });
      t.textContent = `${b.from} │ ${b.to}`;
      svg.appendChild(line);
      svg.appendChild(t);
    }
  },
};

/* ===================== Tooltip (layer descriptions) ===================== */
const Tip = {
  show(alias, x, y) {
    const l = S.flow?.layers[alias];
    if (!l) return;
    el.tip.innerHTML = `<b>${l.icon ? l.icon + ' ' : ''}${esc(l.name)}${l.kind ? ` <span class="tip-kind">${esc(l.kind)}</span>` : ''}</b>${l.desc ? esc(l.desc) : '<span style="opacity:.7">No @layer description yet</span>'}<div style="opacity:.7;margin-top:4px">Click to show only its arrows</div>`;
    el.tip.hidden = false;
    const r = el.canvas.getBoundingClientRect();
    const tw = el.tip.offsetWidth, th = el.tip.offsetHeight;
    el.tip.style.left = clamp(x - r.left + 12, 8, r.width - tw - 8) + 'px';
    el.tip.style.top = clamp(y - r.top + 14, 8, r.height - th - 8) + 'px';
  },
  hide() { if (!el.tip.hidden) el.tip.hidden = true; },
};

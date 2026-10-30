/* ===================== Table view ===================== */
const Table = {
  render() {
    const f = S.flow;
    if (!f?.isSequence) { el.tvBody.innerHTML = '<tr><td colspan="8" class="none">The table works with sequence diagrams.</td></tr>'; return; }
    const hasCh = f.sections.length > 0;
    el.tv.classList.toggle('no-ch', !hasCh);
    el.tv.querySelector('.th-ch').hidden = !hasCh;
    const follow = new Set(Follow.hits), find = new Set(Find.hits);
    let lastSec = -2;
    el.tvBody.innerHTML = f.steps.map((s) => {
      if (Spot.alias && s.from !== Spot.alias && s.to !== Spot.alias) return '';
      if (!Path.visible(s)) return '';
      const newSec = s.section !== lastSec;
      lastSec = s.section;
      const sec = f.sections[s.section];
      const e = Notes.entry(s) || {};
      const cls = [s.idx === S.cur ? 'cur' : '', follow.has(s.idx) ? 'follow' : '', find.has(s.idx) ? 'findhit' : '', hasCh && newSec ? 'chap-start' : ''].filter(Boolean).join(' ');
      const behind = [
        ...s.uses.map((u) => `<span class="chip kd" title="${esc(u.text)}">${esc(u.kind)} ${esc(u.name)}</span>`),
        ...s.effects.map((t) => `<span class="chip ef">${esc(t)}</span>`),
        ...s.unconfirmed.map((t) => `<span class="chip unc" title="${esc(t)}">unconfirmed</span>`),
      ].join(' ');
      return `<tr data-step="${s.idx}" class="${cls}" ${sec ? `style="--ch:${sec.hue}"` : ''} ${s.idx === S.cur ? 'aria-current="step"' : ''}>
        <td class="n" data-l="Step">${s.n}</td>
        ${hasCh ? `<td class="ch" data-l="Chapter">${newSec ? `<span class="dot" aria-hidden="true"></span>${esc(sec?.name || '')}` : ''}</td>` : ''}
        <td class="rt" data-l="From → To">${esc(route(s))} <span class="chip k-${s.kind}">${s.kind}</span></td>
        <td class="sends" data-l="Sends">${s.label.map((l, i) => (i === 0 && s.status ? `<span class="status s-${statusClass(s)}">${esc(s.status.code)}</span> ${esc(l.replace(/^\d{3}\s*/, ''))}` : esc(l))).join('<br>')}</td>
        <td class="does" data-l="Does">${s.explain ? esc(s.explain) : '<span class="none">No explanation</span>'}</td>
        <td data-l="Branch">${s.branch.map((b) => `<span class="chip br"><b>${esc(b.kind)}</b> ${esc(b.label)}</span>`).join('')}</td>
        <td data-l="Behind">${behind}</td>
        <td data-l="Ref">${s.refs.map((r) => `<span class="ref">${esc(r).replace(/\//g, '/<wbr>')}</span>`).join(' ')}</td>
        <td data-l="Note">${e.star ? '★ ' : ''}${esc(e.note || '')}</td>
      </tr>`;
    }).join('');
  },
  markCurrent() {
    for (const tr of el.tvBody.querySelectorAll('tr.cur')) { tr.classList.remove('cur'); tr.removeAttribute('aria-current'); }
    const tr = el.tvBody.querySelector(`tr[data-step="${S.cur}"]`);
    if (tr) {
      tr.classList.add('cur');
      tr.setAttribute('aria-current', 'step');
      if (S.view === 'table') tr.scrollIntoView({ block: 'nearest' });
    }
  },
  rows(includeNotes) {
    const f = S.flow;
    const head = ['Step', 'Chapter', 'From', 'To', 'Kind', 'Status', 'Sends', 'Does', 'Branch', 'Payload', 'Also involved', 'Effects', 'Unconfirmed', 'Ref'];
    if (includeNotes) head.push('Bookmarked', 'Note');
    const rows = f.steps.map((s) => {
      const r = [s.n, f.sections[s.section]?.name || '', s.fromName, s.toName, s.kind, s.status ? s.status.code : '', s.label.join(' / '), s.explain,
        s.branch.map((b) => `${b.kind} ${b.label}`.trim()).join(' > '), s.payload,
        s.uses.map((u) => `${u.kind} ${u.name}${u.ref ? ' (' + u.ref + ')' : ''}`).join('; '), s.effects.join('; '), s.unconfirmed.join('; '), s.refs.join(' ')];
      if (includeNotes) { const e = Notes.entry(s) || {}; r.push(e.star ? 'yes' : '', e.note || ''); }
      return r;
    });
    return { head, rows };
  },
  csv(includeNotes) {
    const { head, rows } = this.rows(includeNotes);
    const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  },
  markdown(includeNotes) {
    const f = S.flow;
    const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    const cols = ['#', 'From → To', 'Sends', 'Does', 'Branch', 'Also involved', 'Ref'];
    if (includeNotes) cols.push('Note');
    const row = (s) => {
      const e = Notes.entry(s) || {};
      const also = [...s.uses.map((u) => `${u.kind} ${u.name}`), ...s.effects.map((t) => 'effect: ' + t), ...s.unconfirmed.map((t) => 'unconfirmed: ' + t)].join('; ');
      const r = [s.n, route(s), '`' + s.label.join(' / ').replace(/`/g, "'") + '`', s.explain || '_No explanation_', s.branch.map((b) => `${b.kind} ${b.label}`.trim()).join(' > '), also, s.refs.join(' ')];
      if (includeNotes) r.push((e.star ? '★ ' : '') + (e.note || ''));
      return '| ' + r.map(cell).join(' | ') + ' |';
    };
    const table = (steps) => ['| ' + cols.join(' | ') + ' |', '|' + cols.map(() => ' --- ').join('|') + '|', ...steps.map(row)].join('\n');
    let md = `# ${f.title}\n\n${f.steps.length} steps, ${f.participants.length} layers.\n\n`;
    if (f.trigger) md += `**Starts when:** ${f.trigger}\n\n`;
    if (f.scope) md += `**Scope:** ${f.scope}\n\n`;
    if (f.proposed) md += `**Proposed design:** this flow does not exist in the code yet.\n\n`;
    if (f.sections.length) {
      for (const [i, sec] of f.sections.entries()) {
        md += `## ${i + 1}. ${sec.name}\n\n${sec.summary ? sec.summary + '\n\n' : ''}${table(f.steps.filter((s) => s.section === i))}\n\n`;
      }
    } else md += table(f.steps) + '\n';
    if (f.uses.length) md += `\n## Behind the scenes\n\n${f.uses.map((u) => `- **${u.kind}** \`${u.name}\`${u.ref ? ` (${u.ref})` : ''}: ${u.text || ''} (steps ${u.steps.map((i) => i + 1).join(', ')})`).join('\n')}\n`;
    if (f.terms.length) md += `\n## Glossary\n\n${f.terms.map((t) => `- **${t.term}**: ${t.def}`).join('\n')}\n`;
    return md;
  },
};

/* ===================== Editor ===================== */
const Editor = {
  lastLines: -1, pasted: false, caretLine: -1,
  init() {
    const ta = el.code;
    const renderSoon = debounce(() => Renderer.render(ta.value), 300);
    this.renderSoon = renderSoon;
    ta.addEventListener('input', () => {
      this.highlight();
      App.autosave(ta.value);
      if (this.pasted) { this.pasted = false; renderSoon.cancel(); Renderer.render(ta.value); } else renderSoon();
    });
    ta.addEventListener('paste', (ev) => {
      const text = ev.clipboardData?.getData('text') || '';
      if (Importer.isLiveLink(text)) { ev.preventDefault(); Importer.fromText(text); return; }
      this.pasted = true;
    });
    ta.addEventListener('scroll', () => this.syncScroll());
    const caret = () => {
      const line = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
      if (line === this.caretLine) return;
      this.caretLine = line;
      const s = S.flow?.steps.find((x) => x.line === line || x.annLines.includes(line));
      if (s && s.idx !== S.cur) Walk.go(s.idx, { from: 'editor' });
    };
    ta.addEventListener('click', caret);
    ta.addEventListener('keyup', (ev) => { if (/^(Arrow|Page|Home|End)/.test(ev.key)) caret(); });
    el.lintList.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-line]');
      if (b) this.gotoLine(+b.dataset.line);
    });
    el.gutter.addEventListener('wheel', (ev) => { ta.scrollTop += ev.deltaY; ev.preventDefault(); }, { passive: false });
  },
  setCode(code, opts = {}) {
    el.code.value = code;
    this.highlight();
    App.autosave(code);
    if (opts.render !== false) { this.renderSoon?.cancel(); Renderer.render(code, opts); }
  },
  syncScroll() {
    el.edHl.scrollTop = el.code.scrollTop;
    el.edHl.scrollLeft = el.code.scrollLeft;
    el.gutter.scrollTop = el.code.scrollTop;
  },
  highlight() {
    const lines = el.code.value.split('\n');
    const cur = this.curLines();
    const err = S.error?.line ?? -1;
    const warn = new Set((S.flow?.lint || []).map((l) => l.line));
    // Chapter colour stripe in the gutter: every line that belongs to a step takes its chapter's hue.
    const hue = new Map();
    for (const s of S.flow?.steps || []) {
      const sec = S.flow.sections[s.section];
      if (!sec) continue;
      for (const l of [s.line, ...s.annLines]) if (l >= 0) hue.set(l, sec.hue);
    }
    el.edHl.innerHTML = lines.map((l, i) => `<span class="l${cur.has(i) ? ' cur' : ''}${i === err ? ' err' : ''}">${colorLine(l) || ' '}</span>`).join('') + '<span class="l"> </span>';
    el.gutter.innerHTML = lines.map((_, i) => `<div class="${i === err ? 'g-err' : cur.has(i) ? 'g-cur' : warn.has(i) ? 'g-warn' : ''}${hue.has(i) ? ' g-ch' : ''}"${hue.has(i) ? ` style="--ch:${hue.get(i)}"` : ''}>${i + 1}</div>`).join('') + '<div></div><div></div>';
    this.syncScroll();
  },
  curLines() {
    const s = S.flow?.steps[S.cur];
    return new Set(s ? [s.line, ...s.annLines].filter((x) => x >= 0) : []);
  },
  markStep(fromEditor) {
    if (!S.codeOpen) return;
    this.highlight();
    const s = S.flow?.steps[S.cur];
    if (s && s.line >= 0 && !fromEditor) this.scrollToLine(s.line);
  },
  scrollToLine(line) {
    const lh = 20;
    const ta = el.code;
    const y = line * lh;
    if (y < ta.scrollTop + 20 || y > ta.scrollTop + ta.clientHeight - 40) ta.scrollTop = Math.max(0, y - ta.clientHeight * 0.4);
    this.syncScroll();
  },
  gotoLine(line) {
    const ta = el.code;
    const lines = ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < line && i < lines.length; i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos + (lines[line]?.length || 0));
    this.scrollToLine(line);
  },
  setError(e) {
    if (!e) el.edStatus.className = 'ed-status', el.edStatus.textContent = S.flow ? `${S.flow.isSequence ? S.flow.steps.length + ' steps · ' : ''}Rendered in ${Math.round(S.lastRenderMs || 0)} ms · Mermaid ${VERSION.mermaid}` : '';
    else {
      el.edStatus.className = 'ed-status err';
      el.edStatus.innerHTML = `<b>${e.line >= 0 ? 'Line ' + (e.line + 1) + ': ' : ''}Syntax error.</b> <span class="mono">${esc(e.msg.split('\n').slice(0, 4).join(' ').slice(0, 300))}</span>`;
    }
    this.highlight();
  },
  renderLint() {
    const lint = S.flow?.lint || [];
    el.lintList.innerHTML = lint.length ? `<li class="lint-h">${lint.length} note${lint.length === 1 ? '' : 's'} on the annotations</li>` + lint.map((l) => `<li><button type="button" data-line="${l.line}"><span class="ln">${l.line + 1}</span>${esc(l.msg)}</button></li>`).join('') : '';
  },
};

const KW_COLOR = /^(\s*)(sequenceDiagram|participant|actor|note\s+(?:over|left of|right of)|note|loop|alt|else|opt|par_over|par|and|critical|option|break|rect|end|activate|deactivate|autonumber|box|create\s+participant|create\s+actor|create|destroy|title|links?|properties|details|accTitle|accDescr)\b(.*)$/i;
function colorLine(l) {
  let m = l.match(/^(\s*)(%%\s*@[A-Za-z]+(?:\.[A-Za-z]+)?)(.*)$/);
  if (m) return esc(m[1]) + `<span class="t-tag">${esc(m[2])}</span><span class="t-tagtx">${esc(m[3])}</span>`;
  if (/^\s*%%/.test(l)) return `<span class="t-cm">${esc(l)}</span>`;
  m = l.match(KW_COLOR);
  if (m) {
    let rest = esc(m[3]);
    rest = rest.replace(/^(\s+)(\S+)(\s+as\s+)/i, '$1<span class="t-al">$2</span>$3');
    return esc(m[1]) + `<span class="t-kw">${esc(m[2])}</span>` + rest;
  }
  const colon = l.indexOf(':');
  const left = colon >= 0 ? l.slice(0, colon) : l;
  const am = findArrow(left);
  if (am) {
    const a = am.index, b = am.index + am[0].length;
    return `<span class="t-al">${esc(left.slice(0, a))}</span><span class="t-ar">${esc(left.slice(a, b))}</span><span class="t-al">${esc(left.slice(b))}</span>` + (colon >= 0 ? esc(l.slice(colon)) : '');
  }
  return esc(l);
}

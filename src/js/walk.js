/* ===================== Walkthrough bar ===================== */
const Walk = {
  count() { return S.flow?.isSequence ? S.flow.steps.length : 0; },
  go(i, opts = {}) {
    const n = this.count();
    if (!n) return;
    i = clamp(i, -1, n - 1);
    const dir = i > S.cur ? 'next' : i < S.cur ? 'prev' : null;
    const changed = i !== S.cur;
    S.cur = i;
    if (changed) { S.noteOpen = false; Ask.close(false); }
    Hl.apply(i);
    this.render(opts.animate === false ? null : dir);
    Chapters.render();
    Progress.render();
    Follow.renderStrip();
    Table.markCurrent();
    Editor.markStep(opts.from === 'editor');
    Insight.markCurrent();
    if (opts.camera !== false && i >= 0 && S.view === 'diagram') Camera.followStep(S.flow.steps[i]);
    if (changed) { this.announce(); Presenter.render(); }
  },
  /** Next step that the path filter and the chapter lock allow. */
  nextIdx(from, dir) {
    const f = S.flow;
    for (let i = from + dir; i >= 0 && i < f.steps.length; i += dir) {
      const s = f.steps[i];
      if (!Path.visible(s)) continue;
      if (S.chapterLock && S.cur >= 0 && s.section !== f.steps[S.cur].section) return -2;
      return i;
    }
    return -1;
  },
  next() {
    const i = this.nextIdx(S.cur, 1);
    if (i === -2) Shell.toast('End of this chapter. Press K to unlock the chapter.');
    else if (i >= 0) this.go(i);
  },
  prev() {
    if (S.cur < 0) return;
    const i = this.nextIdx(S.cur, -1);
    if (i === -2) Shell.toast('Start of this chapter. Press K to unlock the chapter.');
    else this.go(i >= 0 ? i : -1);
  },
  announce() {
    const f = S.flow;
    const s = f.steps[S.cur];
    el.live.textContent = s
      ? `Step ${s.n} of ${f.steps.length}. ${s.kind === 'self' ? s.fromName + ' to itself' : s.fromName + ' to ' + s.toName}: ${s.label.join(' ')}. ${s.explain}`
      : `Overview. ${f.steps.length} steps.`;
  },
  render(dir) {
    const f = S.flow;
    const n = this.count();
    el.prevBtn.disabled = !n || S.cur < 0;
    el.nextBtn.disabled = !n || S.cur >= n - 1;
    if (!f) return;
    if (!f.isSequence) {
      el.cardPrev.className = 'card side empty'; el.cardNext.className = 'card side empty';
      el.cardPrev.innerHTML = ''; el.cardNext.innerHTML = '';
      el.cardCur.innerHTML = `<div class="overview"><h3>${esc(f.title)}</h3><p>This is a <b>${esc(f.diagramType)}</b> diagram. The walkthrough, pinned header and table work with sequence diagrams, so only pan and zoom are on.</p></div>`;
      return;
    }
    const side = (box, i) => {
      const s = f.steps[i];
      if (!s) { box.className = 'card side empty'; box.innerHTML = ''; box.removeAttribute('aria-label'); box.tabIndex = -1; return; }
      box.className = 'card side' + (Path.visible(s) ? '' : ' off');
      box.dataset.step = i;
      box.tabIndex = 0;
      box.setAttribute('aria-label', `Go to step ${s.n}`);
      box.innerHTML = `<div class="side-h">Step ${s.n}</div><div class="side-r">${esc(route(s, true))}</div><div class="side-s">${esc(s.label.join(' '))}</div><div class="side-d">${esc(s.explain || '')}</div>`;
    };
    if (S.cur < 0) {
      side(el.cardPrev, -1);
      side(el.cardNext, this.nextIdx(-1, 1) < 0 ? 0 : this.nextIdx(-1, 1));
      el.cardCur.innerHTML = this.overviewHTML(f);
    } else {
      side(el.cardPrev, this.nextIdx(S.cur, -1) >= 0 ? this.nextIdx(S.cur, -1) : -1);
      side(el.cardNext, this.nextIdx(S.cur, 1) >= 0 ? this.nextIdx(S.cur, 1) : -1);
      el.cardCur.innerHTML = this.centerHTML(f.steps[S.cur]);
      this.bindCenter();
      Ask.mount();
    }
    if (dir) {
      el.cards.classList.remove('slide-next', 'slide-prev');
      void el.cards.offsetWidth;
      el.cards.classList.add(dir === 'next' ? 'slide-next' : 'slide-prev');
    }
  },
  overviewHTML(f) {
    const n = f.steps.length;
    const chaps = f.sections.length ? ` in ${plural(f.sections.length, 'chapter')}` : '';
    const endings = f.endings.length
      ? `<p class="ov-line"><b>Possible endings:</b> ${f.endings.map((s) => `<button type="button" class="chip st s-${statusClass(s)}" data-go="${s.idx}" title="Go to step ${s.n}">${esc(s.label[0])}</button>`).join(' ')}</p>` : '';
    const lines = [];
    if (f.proposed) lines.push(`<p class="ov-line warn-line"><b>Proposed design.</b> This flow does not exist in the code yet; it follows the project's own patterns.</p>`);
    if (f.scope) lines.push(`<p class="ov-line"><b>Scope:</b> ${termHTML(f.scope)}</p>`);
    if (f.trigger) lines.push(`<p class="ov-line"><b>Starts when:</b> ${termHTML(f.trigger)}</p>`);
    if (f.summary) lines.push(`<p class="ov-line">${termHTML(f.summary)}</p>`);
    const layers = f.participants.map((p) => { const l = f.layers[p.alias]; return `<button type="button" class="layer-pill" data-spot="${esc(p.alias)}" title="${esc(l?.desc || 'Click to show only its arrows')}">${l?.icon ? `<span aria-hidden="true">${l.icon}</span> ` : ''}<b>${esc(p.name)}</b></button>`; }).join('');
    const extras = [];
    if (f.uses.length) extras.push(`<button type="button" class="chip" data-open="behind">${plural(f.uses.length, 'side part')}</button>`);
    if (f.terms.length) extras.push(`<button type="button" class="chip" data-open="glossary">${plural(f.terms.length, 'term')}</button>`);
    if (f.unconfirmed) extras.push(`<button type="button" class="chip unc" data-open="errors">${plural(f.unconfirmed, 'unconfirmed detail')}</button>`);
    return `<div class="overview"><h3>${esc(f.title)}${f.proposed ? ' <span class="chip unc">proposed</span>' : ''}</h3>
      <p>${n} steps, ${plural(f.participants.length, 'layer')}${chaps}. Press <span class="kbd">&rarr;</span> to start, or click any arrow.</p>
      ${lines.join('')}${endings}
      <div class="layers">${layers}</div>
      ${extras.length ? `<div class="ov-extras">${extras.join('')}</div>` : ''}</div>`;
  },
  centerHTML(s) {
    const f = S.flow;
    const sec = f.sections[s.section];
    const inSec = sec ? `<span class="in-sec" style="--ch:${sec.hue}">&middot; ${s.idx - sec.firstStep + 1} of ${sec.count} in <b>${esc(sec.name)}</b></span>` : '';
    const chips = s.branch.map((b) => `<span class="chip br" title="${esc(b.kind + ' ' + b.label)}"><b>${esc(b.kind)}</b> ${esc(b.label)}</span>`).join('');
    const flags = FLAG_TAGS.filter((k) => s.flags[k]).map((k) => `<span class="chip fl" title="${esc(typeof s.flags[k] === 'string' ? s.flags[k] : k)}">${esc(k)}${typeof s.flags[k] === 'string' ? ' ' + esc(s.flags[k]) : ''}</span>`).join('');
    const unc = s.unconfirmed.map((t) => `<span class="chip unc" title="${esc(t)}">unconfirmed</span>`).join('');
    const proposed = f.proposed ? '<span class="chip unc" title="This flow is a design; this step does not exist in the code yet">proposed</span>' : '';
    const e = Notes.entry(s) || {};
    const sends = s.label.map((l, i) => `<span class="mk">${i === 0 && s.status ? statusHTML(s, l) : tokHTML(l)}</span>`).join('<br>');
    const does = s.explain
      ? `<p class="does">${termHTML(s.explain)}</p>`
      : `<p class="does fallback">${s.kind === 'self' ? esc(s.fromName) + ' works on its own here' : 'Sends this from ' + esc(s.fromName) + ' to ' + esc(s.toName)}. No explanation yet.</p>`;
    const summary = sec && sec.summary && s.idx === sec.firstStep ? `<p class="summary" style="--ch:${sec.hue}"><b>${esc(sec.name)}:</b> ${termHTML(sec.summary)}</p>` : '';
    const pair = this.pairHTML(s);
    const extra = [];
    if (s.payloads.length) extra.push(`<details id="payloadBox"><summary>Show payload</summary>${payloadHTML(s)}</details>`);
    const diff = s.answers >= 0 ? payloadDiff(bodyText(f.steps[s.answers]), bodyText(s)) : null;
    if (diff && (diff.added.length || diff.removed.length || diff.changed.length)) {
      extra.push(`<div class="diff"><b>Compared with the request body:</b> ${diff.added.map((k) => `<span class="d-add">+ ${esc(k)}</span>`).join(' ')} ${diff.changed.map((k) => `<span class="d-chg">~ ${esc(k)}</span>`).join(' ')} ${diff.removed.map((k) => `<span class="d-del">− ${esc(k)}</span>`).join(' ')}</div>`);
    }
    if (s.schema.length) extra.push(`<details><summary>Schema (${s.schema.length})</summary><table class="mini"><tbody>${s.schema.map((r) => `<tr><td class="mono">${esc(r.field)}</td><td>${termHTML(r.text)}</td></tr>`).join('')}</tbody></table></details>`);
    if (s.state.before || s.state.after) extra.push(`<div class="state"><div><b>Before</b><pre>${esc(s.state.before || '—')}</pre></div><div><b>After</b><pre>${esc(s.state.after || '—')}</pre></div></div>`);
    if (s.fields.length) extra.push(`<div class="fields"><b>Fields:</b> ${s.fields.map((x) => `<span class="field"><code>${esc(x.name)}</code> ${stepLinks(x.text)}</span>`).join(' ')}</div>`);
    if (s.effects.length) extra.push(`<div class="effects"><b>Effects:</b> ${s.effects.map((t) => `<span class="chip ef">${termHTML(t)}</span>`).join(' ')}</div>`);
    for (const r of s.refs) {
      extra.push(/^https?:\/\//i.test(r)
        ? `<a class="ref" href="${esc(r)}" target="_blank" rel="noopener noreferrer">${esc(r.replace(/^https?:\/\//, ''))}</a>`
        : `<span class="ref" title="Source">${esc(r)}</span>`);
    }
    if (s.unconfirmed.length) extra.push(`<div class="unc-list">${s.unconfirmed.map((t) => `<div><b>Not confirmed:</b> ${esc(t)}</div>`).join('')}</div>`);
    const uses = s.uses.length
      ? `<details class="uses"><summary>Also involved: ${usesSummary(s.uses)}</summary><ul>${s.uses.map((u) => `<li><span class="chip kd">${esc(u.kind)}</span> <b>${esc(u.name)}</b>${u.ref ? ` <span class="ref">${esc(u.ref)}</span>` : ''}${u.text ? `<span class="u-text">${termHTML(u.text)}</span>` : ''}</li>`).join('')}</ul></details>` : '';
    let note = '';
    if (S.noteOpen) {
      note = `<div class="note-edit"><textarea id="noteTa" aria-label="Your note for step ${s.n}" placeholder="Your note (only in this browser)">${esc(e.note || '')}</textarea><span class="hint">Saved as you type. Only in this browser${Store.ok ? '' : ' (storage is blocked, so only for this session)'}.</span></div>`;
    } else if (e.note) {
      note = `<div class="note-view"><b>Your note:</b> ${esc(e.note)}</div>`;
    }
    return `<div class="c-top">
        <span class="count">Step <input id="stepInput" type="text" inputmode="numeric" value="${s.n}" aria-label="Step number, type to jump"> of ${f.steps.length}</span>
        ${inSec}${chips}${flags}${unc}${proposed}<span class="spacer"></span>
        <button type="button" class="ibtn" id="askBtn" aria-pressed="${Ask.open}" aria-label="Ask about this step (A)" title="Ask AI about this step (A)">?</button>
        <button type="button" class="ibtn" id="starBtn" aria-pressed="${!!e.star}" aria-label="Bookmark this step (B)" title="Bookmark (B)">${e.star ? '★' : '☆'}</button>
        <button type="button" class="ibtn" id="noteBtn" aria-pressed="${S.noteOpen}" aria-label="Write a note (N)" title="Note (N)">✎</button>
      </div>
      <div class="route">${s.kind === 'self' ? `<span>${esc(s.fromName)}</span><span class="arrow">↻ itself</span>` : `<span>${esc(s.fromName)}</span><span class="arrow">──►</span><span>${esc(s.toName)}</span>`}<span class="chip k-${s.kind}">${s.kind}</span>${pair.chip}</div>
      <div class="sends" aria-label="What it sends">${sends}</div>
      ${s.status && STATUS_TEXT[s.status.code] ? `<p class="status-note">${esc(STATUS_TEXT[s.status.code])}</p>` : ''}
      ${summary}${does}${pair.list}
      ${extra.length ? `<div class="c-extra">${extra.join('')}</div>` : ''}
      ${uses}
      <div id="askBox"></div>
      ${note}`;
  },
  /** Request ↔ reply links for the card: a chip on the route line and the reply catalog. */
  pairHTML(s) {
    const f = S.flow;
    if (s.kind === 'reply' && s.answers >= 0) {
      const r = f.steps[s.answers];
      return { chip: `<button type="button" class="chip pair" data-go="${r.idx}" title="Go to step ${r.n}">answers step ${r.n}: ${esc(r.label[0])}</button>`, list: '' };
    }
    if (s.kind === 'request' && s.replies.length) {
      const list = s.replies.map((i) => { const r = f.steps[i]; const br = r.branch.length ? r.branch[r.branch.length - 1].label : ''; return `<button type="button" class="chip st s-${statusClass(r)}" data-go="${i}" title="Go to step ${r.n}">${esc(r.label[0])}<span class="st-n">step ${r.n}${br ? ' · ' + esc(br) : ''}</span></button>`; }).join('');
      return { chip: '', list: `<div class="replies"><b>${s.replies.length === 1 ? 'Reply' : 'Replies'}:</b> ${list}</div>` };
    }
    if (s.kind === 'request' && s.http) return { chip: '', list: '<div class="replies none">No reply arrow for this request yet.</div>' };
    return { chip: '', list: '' };
  },
  bindCenter() {
    const inp = $('#stepInput');
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { const v = parseInt(inp.value, 10); if (v >= 1) this.go(v - 1); ev.preventDefault(); }
      if (ev.key === 'Escape') { inp.value = S.cur + 1; inp.blur(); }
      ev.stopPropagation();
    });
    inp.addEventListener('focus', () => inp.select());
    $('#starBtn').addEventListener('click', () => Notes.toggleStar());
    $('#noteBtn').addEventListener('click', () => this.toggleNote());
    $('#askBtn').addEventListener('click', () => Ask.toggle());
    const ta = $('#noteTa');
    if (ta) {
      const save = debounce(() => Notes.setNote(S.flow.steps[S.cur], ta.value), 300);
      ta.addEventListener('input', save);
      ta.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { save.cancel(); Notes.setNote(S.flow.steps[S.cur], ta.value); this.toggleNote(false); } ev.stopPropagation(); });
      ta.addEventListener('blur', () => { save.cancel(); Notes.setNote(S.flow.steps[S.cur], ta.value, true); });
    }
  },
  toggleNote(on) {
    if (S.cur < 0) return;
    S.noteOpen = on ?? !S.noteOpen;
    this.render(null);
    if (S.noteOpen) { const ta = $('#noteTa'); ta?.focus(); ta?.setSelectionRange(ta.value.length, ta.value.length); }
    else el.canvas.focus({ preventScroll: true });
  },
};
function route(s, short) {
  const a = short ? s.from : s.fromName, b = short ? s.to : s.toName;
  return s.kind === 'self' ? `${a} ↻ itself` : `${a} → ${b}`;
}
function statusClass(s) { const c = s.status?.code || 0; return c >= 500 ? '5xx' : c >= 400 ? '4xx' : c >= 300 ? '3xx' : c >= 200 ? '2xx' : 'none'; }
function usesSummary(uses) {
  const byKind = {};
  for (const u of uses) byKind[u.kind] = (byKind[u.kind] || 0) + 1;
  return Object.entries(byKind).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(' · ');
}
/** The first label line of a reply: the status code gets its general meaning as a tooltip. */
function statusHTML(s, line) {
  const m = line.match(STATUS_RE);
  if (!m) return tokHTML(line);
  const text = STATUS_TEXT[s.status.code] || '';
  return `<span class="status s-${statusClass(s)}" title="${esc(text)}">${esc(m[1])}</span> ${tokHTML(m[2])}`;
}
/** Payload parts as labelled blocks. */
function payloadHTML(s) {
  return s.payloads.map((p) => `<div class="pl-part"><span class="pl-h">${esc(PART_LABEL[p.part] || p.part)}</span><pre>${tokHTML(p.text)}</pre></div>`).join('');
}
/** "step 6" inside text becomes a link to that step. */
function stepLinks(text) {
  return esc(text).replace(/\bstep\s+(\d+)\b/gi, (m, n) => (S.flow?.steps[n - 1] ? `<button type="button" class="step-link" data-go="${n - 1}">${m}</button>` : m));
}
/** Escapes text and wraps followable tokens so a click starts Follow a value. */
function tokHTML(text, plain) {
  if (plain) return esc(text);
  let out = '', last = 0;
  const on = Follow.tok;
  for (const m of String(text).matchAll(TOKEN_RE)) {
    out += esc(text.slice(last, m.index));
    const t = m[0];
    const def = Glossary.lookup(t);
    const cls = ['tok', on && t.toLowerCase() === on ? 'on' : '', def ? 'term' : ''].filter(Boolean).join(' ');
    out += isFollowable(t) || def ? `<span class="${cls}" data-tok="${esc(t)}"${def ? ` data-term="${esc(def.term)}" title="${esc(def.def)}"` : ' title="Follow this value"'}>${esc(t)}</span>` : esc(t);
    last = m.index + t.length;
  }
  return out + esc(String(text).slice(last));
}
/** Prose with glossary terms underlined (no Follow tokens). */
function termHTML(text) {
  if (!Glossary.size()) return esc(text);
  let out = '', last = 0;
  for (const m of String(text).matchAll(Glossary.regex())) {
    out += esc(text.slice(last, m.index));
    const def = Glossary.lookup(m[0]);
    out += def ? `<span class="term" data-term="${esc(def.term)}" title="${esc(def.def)}">${esc(m[0])}</span>` : esc(m[0]);
    last = m.index + m[0].length;
  }
  return out + esc(String(text).slice(last));
}

/* ===================== Chapters ===================== */
const Chapters = {
  render() {
    const f = S.flow;
    const secs = f?.isSequence ? f.sections : [];
    el.chapters.hidden = !secs.length;
    if (!secs.length) { el.chapters.innerHTML = ''; return; }
    const cur = S.cur >= 0 ? f.steps[S.cur].section : -1;
    el.chapters.innerHTML = secs.map((s, i) => `${i ? '<span class="sep" aria-hidden="true">&middot;</span>' : ''}<button type="button" data-sec="${i}" style="--ch:${s.hue}" class="${i === cur ? 'cur' : ''}" ${i === cur ? 'aria-current="step"' : ''} title="${esc(s.summary || `${plural(s.count, 'step')}, from step ${s.firstStep + 1}`)}"><span class="dot" aria-hidden="true"></span>${esc(s.name)}</button>`).join('')
      + `<button type="button" class="lock ${S.chapterLock ? 'on' : ''}" id="lockBtn" aria-pressed="${!!S.chapterLock}" title="Stay inside the current chapter (K)">${S.chapterLock ? '🔒' : '🔓'}</button>`;
    el.chapters.querySelector('.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  jump(i) { const s = S.flow?.sections[i]; if (s) Walk.go(s.firstStep); },
  next() {
    const f = S.flow; if (!f?.sections.length) return;
    const nx = f.sections.find((s) => s.firstStep > S.cur);
    if (nx) Walk.go(nx.firstStep);
  },
  prev() {
    const f = S.flow; if (!f?.sections.length || S.cur < 0) return;
    const cur = f.steps[S.cur].section;
    const sec = f.sections[cur];
    if (S.cur > sec.firstStep) Walk.go(sec.firstStep);
    else if (cur > 0) Walk.go(f.sections[cur - 1].firstStep);
  },
  toggleLock(on) {
    S.chapterLock = on ?? !S.chapterLock;
    this.render();
    Shell.announce(S.chapterLock ? 'Chapter locked: the arrow keys stay inside this chapter' : 'Chapter unlocked');
  },
};

/* ===================== Progress bar: one segment per chapter ===================== */
const Progress = {
  render() {
    const f = S.flow;
    const box = el.progress;
    if (!f?.isSequence || !f.steps.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const secs = f.sections.length ? f.sections : [{ name: f.title, firstStep: 0, count: f.steps.length, hue: 210, idx: 0 }];
    const total = f.steps.length;
    box.innerHTML = secs.map((s) => {
      const done = clamp(S.cur + 1 - s.firstStep, 0, s.count);
      const cur = S.cur >= 0 && S.cur >= s.firstStep && S.cur < s.firstStep + s.count;
      return `<button type="button" class="seg-ch${cur ? ' cur' : ''}" data-sec="${s.idx}" style="--ch:${s.hue};flex-grow:${s.count};flex-basis:0" title="${esc(s.name)}: ${plural(s.count, 'step')}"><span class="fill" style="width:${(done / s.count) * 100}%"></span></button>`;
    }).join('');
    box.setAttribute('aria-label', `Progress: step ${S.cur + 1} of ${total}`);
  },
};

/* ===================== Path filter: all, happy path, errors only, one branch ===================== */
const Path = {
  mode: 'all', // 'all' | 'happy' | 'errors' | 'branch:<id>:<label>'
  visible(s) {
    if (!s) return true;
    const m = this.mode;
    if (m === 'all') return true;
    if (m === 'happy') return !s.inElse && !s.isError;
    if (m === 'errors') return s.isError || s.inElse || !s.branch.some((b) => b.kind === 'alt');
    if (m.startsWith('branch:')) {
      const [, id, label] = m.match(/^branch:(\d+):(.*)$/) || [];
      const e = s.branch.find((b) => String(b.id) === id);
      return !e || e.label === label;
    }
    return true;
  },
  /** Every alt / else branch in the flow, for the chooser. */
  branches() {
    const seen = new Map();
    for (const s of S.flow?.steps || []) {
      for (const b of s.branch) {
        if (b.kind !== 'alt' && b.kind !== 'else') continue;
        const k = `branch:${b.id}:${b.label}`;
        if (!seen.has(k)) seen.set(k, { key: k, label: b.label || '(unnamed branch)', kind: b.kind });
      }
    }
    return [...seen.values()];
  },
  set(mode) {
    this.mode = mode;
    const f = S.flow;
    const sel = el.pathSel;
    if (sel && sel.value !== mode) sel.value = mode;
    document.body.classList.toggle('path-on', mode !== 'all');
    Hl.decorate();
    Table.render();
    Walk.render(null);
    Progress.render();
    if (f?.isSequence) {
      const n = f.steps.filter((s) => this.visible(s)).length;
      if (mode !== 'all') Shell.notice(`Path: <b>${esc(this.label(mode))}</b>, ${n} of ${f.steps.length} steps. <button type="button" class="btn" data-act="path-clear" style="height:24px;margin-left:6px">Show all</button>`);
      else if (!Spot.alias) Shell.notice(null);
    }
  },
  label(mode) {
    if (mode === 'happy') return 'happy path';
    if (mode === 'errors') return 'errors only';
    const b = this.branches().find((x) => x.key === mode);
    return b ? `${b.kind} ${b.label}` : 'all steps';
  },
  renderSelect() {
    const sel = el.pathSel;
    if (!sel) return;
    const f = S.flow;
    const branches = f?.isSequence ? this.branches() : [];
    const hasAlt = branches.length > 0 || (f?.steps || []).some((s) => s.isError);
    sel.hidden = !hasAlt;
    if (!hasAlt) { if (this.mode !== 'all') this.set('all'); return; }
    const cur = this.mode;
    sel.innerHTML = `<option value="all">Path: all steps</option><option value="happy">Happy path only</option><option value="errors">Errors only</option>`
      + (branches.length ? `<optgroup label="One branch">${branches.map((b) => `<option value="${esc(b.key)}">${esc(b.kind)} ${esc(b.label)}</option>`).join('')}</optgroup>` : '');
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : 'all';
    if (sel.value !== cur) this.set(sel.value);
  },
};

/* ===================== Follow a value ===================== */
const Follow = {
  tok: null, display: '', hits: [],
  start(t) {
    const tok = String(t || '').trim();
    if (!tok) return;
    if (!isFollowable(tok)) { Shell.toast(`"${tok}" is too short or too common to follow`); return; }
    this.tok = tok.toLowerCase();
    this.display = tok;
    this.compute();
    if (!this.hits.length) { Shell.toast(`"${tok}" does not appear in any step`); this.clear(); return; }
    this.refresh();
    Shell.announce(`${tok} appears in steps ${this.hits.map((i) => i + 1).join(', ')}`);
  },
  compute() { this.hits = this.tok && S.flow?.isSequence ? S.flow.steps.filter((s) => stepTokens(s).has(this.tok)).map((s) => s.idx) : []; },
  clear() { this.tok = null; this.hits = []; this.refresh(); },
  refresh() { Hl.decorate(); this.renderStrip(); Table.render(); Walk.render(null); },
  renderStrip() {
    if (!this.tok) { el.followStrip.hidden = true; el.followStrip.innerHTML = ''; return; }
    el.followStrip.hidden = false;
    el.followStrip.innerHTML = `<span><code>${esc(this.display)}</code> appears in step${this.hits.length === 1 ? '' : 's'}</span>
      <span class="steps">${this.hits.map((i) => `<button type="button" data-go="${i}" class="${i === S.cur ? 'cur' : ''}">${i + 1}</button>`).join(', ')}</span>
      <button type="button" class="btn" data-fol="prev" aria-label="Previous step with this value">&lsaquo;</button>
      <button type="button" class="btn" data-fol="next" aria-label="Next step with this value">&rsaquo;</button>
      <button type="button" class="btn" data-fol="ask" title="Ask what this value is">Ask</button>
      <button type="button" class="btn" data-fol="clear" aria-label="Stop following">&times;</button>`;
  },
  next() { const n = this.hits.find((i) => i > S.cur); Walk.go(n ?? this.hits[0]); },
  prev() { const p = [...this.hits].reverse().find((i) => i < S.cur); Walk.go(p ?? this.hits[this.hits.length - 1]); },
};

/* ===================== Find ===================== */
const Find = {
  q: '', hits: [],
  open() { el.findPop.hidden = false; el.findInput.focus(); el.findInput.select(); },
  close() { el.findPop.hidden = true; this.run(''); el.canvas.focus({ preventScroll: true }); },
  run(q) {
    this.q = q.trim().toLowerCase();
    const f = S.flow;
    this.hits = this.q && f?.isSequence
      ? f.steps.filter((s) => [s.label.join(' '), s.explain, s.payload, s.fromName, s.toName, f.sections[s.section]?.name || '', s.uses.map((u) => u.name + ' ' + u.text).join(' '), s.effects.join(' ')].join(' \n ').toLowerCase().includes(this.q)).map((s) => s.idx)
      : [];
    this.count();
    Table.render();
  },
  count() {
    const pos = this.hits.indexOf(S.cur);
    el.findCount.textContent = this.q ? (this.hits.length ? `${pos >= 0 ? pos + 1 : '–'} of ${this.hits.length}` : 'No match') : '';
  },
  next() { if (!this.hits.length) return; const n = this.hits.find((i) => i > S.cur); Walk.go(n ?? this.hits[0]); this.count(); },
  prev() { if (!this.hits.length) return; const p = [...this.hits].reverse().find((i) => i < S.cur); Walk.go(p ?? this.hits[this.hits.length - 1]); this.count(); },
};

/* ===================== Participant spotlight ===================== */
const Spot = {
  alias: null,
  toggle(a) { this.alias = this.alias === a ? null : a; this.apply(); },
  clear() { this.alias = null; this.apply(); },
  apply() {
    Hl.decorate();
    Table.render();
    Insight.render();
    if (this.alias) {
      const name = S.flow.layers[this.alias]?.name || this.alias;
      const cnt = S.flow.steps.filter((s) => s.from === this.alias || s.to === this.alias).length;
      Shell.notice(`Showing only the ${cnt} arrows of <b>${esc(name)}</b>. <button type="button" class="btn" data-act="spot-clear" style="height:24px;margin-left:6px">Show all</button>`);
    } else if (Path.mode !== 'all') Path.set(Path.mode);
    else Shell.notice(null);
  },
};

/* ===================== Autoplay ===================== */
const Play = {
  timer: 0,
  toggle() { S.playing ? this.stop() : this.start(); },
  start() {
    const n = Walk.count();
    if (!n) return;
    S.playing = true;
    if (S.cur >= n - 1) Walk.go(0); else Walk.next();
    this.ui();
    this.schedule();
  },
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!S.playing) return;
      if (Walk.nextIdx(S.cur, 1) < 0) { this.stop(); return; }
      Walk.next();
      this.schedule();
    }, S.settings.speed);
  },
  stop() { S.playing = false; clearTimeout(this.timer); this.ui(); },
  ui() {
    el.playBtn.setAttribute('aria-pressed', S.playing);
    el.playIcon.textContent = S.playing ? '❚❚' : '▶';
    el.playLbl.textContent = S.playing ? 'Pause' : 'Play';
  },
};

/* ===================== Presenter mode: controls hidden, one big card ===================== */
const Presenter = {
  on: false,
  toggle(on) {
    this.on = on ?? !this.on;
    document.body.classList.toggle('presenter', this.on);
    if (this.on && !S.hide) Shell.setHide(true, true);
    if (!this.on && S.hide) Shell.setHide(false);
    this.render();
    Shell.announce(this.on ? 'Presenter mode. Arrow keys step, Escape leaves.' : 'Presenter mode off');
  },
  render() {
    const box = el.presentCard;
    if (!this.on) { box.hidden = true; box.innerHTML = ''; return; }
    const f = S.flow;
    const s = f?.steps[S.cur];
    box.hidden = false;
    if (!s) { box.innerHTML = `<h2>${esc(f?.title || '')}</h2><p class="muted">${f ? plural(f.steps.length, 'step') : ''}. Press → to start.</p>`; return; }
    const e = Notes.entry(s) || {};
    const sec = f.sections[s.section];
    box.innerHTML = `<div class="p-top"><span>Step ${s.n} of ${f.steps.length}</span>${sec ? `<span class="in-sec" style="--ch:${sec.hue}">${esc(sec.name)}</span>` : ''}</div>
      <div class="p-route">${esc(route(s))}</div>
      <div class="p-sends">${s.label.map(esc).join('<br>')}</div>
      <p class="p-does">${esc(s.explain || '')}</p>
      ${e.note ? `<div class="p-note"><b>Speaker note:</b> ${esc(e.note)}</div>` : ''}`;
  },
};

/* ===================== Personal notes and bookmarks ===================== */
const Notes = {
  id: '', data: {},
  flowId(f) { return f.hasTitle ? 't:' + f.title : 'p:' + hashStr(f.participants.map((p) => p.alias).join(',')); },
  load(f) {
    if (!f?.isSequence) return;
    const id = this.flowId(f);
    if (id !== this.id) {
      const prev = this.id;
      this.id = id;
      this.data = Store.get('swv:notes:' + id, {}) || {};
      if (!Object.keys(this.data).length) this.adopt(f, prev);
    }
    this.ui();
  },
  /** Notes are filed under the flow's title, so adding or renaming @title would hide them.
   *  When this flow has none, take over the stored set whose steps match it best (at least half).
   *  Silent while the title is being typed (the set comes from the flow shown a moment ago). */
  adopt(f, prev) {
    const keys = new Set(f.steps.map((s) => s.key));
    let best = null;
    for (const k of Store.keys('swv:notes:')) {
      if (k === 'swv:notes:' + this.id) continue;
      const d = Store.get(k, {}) || {};
      const n = Object.keys(d).length;
      const hits = Object.keys(d).filter((x) => keys.has(x)).length;
      if (hits && hits * 2 >= n && (!best || hits > best.hits)) best = { k, d, hits };
    }
    if (!best) return;
    this.data = best.d;
    Store.set('swv:notes:' + this.id, this.data);
    Store.del(best.k);
    if (best.k !== 'swv:notes:' + prev) Shell.toast(`Your notes moved with this flow (${plural(best.hits, 'step')})`);
  },
  entry(s) { return s ? this.data[s.key] : null; },
  save() {
    for (const [k, v] of Object.entries(this.data)) if (!v.star && !(v.note || '').trim()) delete this.data[k];
    Store.set('swv:notes:' + this.id, this.data);
    this.ui();
    Hl.decorate();
  },
  touch(s) {
    const e = this.data[s.key] || (this.data[s.key] = { star: false, note: '' });
    Object.assign(e, { n: s.n, route: route(s), label: s.label.join(' / '), updated: new Date().toISOString() });
    return e;
  },
  toggleStar() {
    const s = S.flow?.steps[S.cur];
    if (!s) return;
    const e = this.touch(s);
    e.star = !e.star;
    this.save();
    Walk.render(null);
    Table.render();
    Shell.announce(e.star ? `Step ${s.n} bookmarked` : `Bookmark removed from step ${s.n}`);
  },
  setNote(s, text, final) {
    if (!s) return;
    const e = this.touch(s);
    if (e.note === text && !final) return;
    e.note = text;
    this.save();
    Table.render();
  },
  /** Adds a block of text to the step's note (used for saved AI answers). */
  append(s, text) {
    if (!s || !text.trim()) return;
    const e = this.touch(s);
    e.note = [e.note, text.trim()].filter((x) => (x || '').trim()).join('\n\n');
    this.save();
    Walk.render(null);
    Table.render();
  },
  count() { return Object.values(this.data).filter((v) => v.star).length; },
  orphans() {
    const keys = new Set((S.flow?.steps || []).map((s) => s.key));
    return Object.entries(this.data).filter(([k]) => !keys.has(k));
  },
  attach(oldKey, s) {
    const e = this.data[oldKey];
    if (!e || !s) return;
    const t = this.touch(s);
    t.star = t.star || e.star;
    t.note = [t.note, e.note].filter((x) => (x || '').trim()).join('\n');
    delete this.data[oldKey];
    this.save();
    Walk.render(null); Table.render(); BmPop.render();
  },
  remove(k) { delete this.data[k]; this.save(); Walk.render(null); Table.render(); BmPop.render(); },
  clearAll() { this.data = {}; this.save(); Walk.render(null); Table.render(); BmPop.render(); },
  ui() {
    const c = this.count();
    const o = this.orphans().length;
    el.bmBtn.innerHTML = `★ ${c}<span class="sr-only"> bookmarks</span>${o ? ` <span class="chip" title="Notes for steps that changed">${o} changed</span>` : ''}`;
  },
  exportObj() {
    return { format: 'swv-notes/1', flow: S.flow?.title || '', flowId: this.id, exported: new Date().toISOString(), notes: this.data };
  },
  importObj(obj) {
    if (!obj || typeof obj.notes !== 'object') throw new Error('This file has no notes in it');
    let n = 0;
    for (const [k, v] of Object.entries(obj.notes)) {
      const cur = this.data[k];
      if (!cur || (v.updated || '') > (cur.updated || '')) { this.data[k] = v; n++; }
    }
    this.save();
    Walk.render(null); Table.render();
    return n;
  },
};

/* Bookmark list popover */
const BmPop = {
  node: null, confirmClear: false,
  open() {
    this.close();
    const p = document.createElement('div');
    p.className = 'pop';
    p.id = 'bmPop';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Bookmarks and notes');
    document.body.appendChild(p);
    this.node = p;
    this.confirmClear = false;
    this.render();
    const r = el.bmBtn.getBoundingClientRect();
    p.style.right = Math.max(16, window.innerWidth - r.right) + 'px';
    p.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    el.bmBtn.setAttribute('aria-expanded', 'true');
    p.querySelector('button')?.focus();
  },
  close() { this.node?.remove(); this.node = null; el.bmBtn.setAttribute('aria-expanded', 'false'); },
  render() {
    const p = this.node;
    if (!p) return;
    const f = S.flow;
    const items = (f?.steps || []).filter((s) => { const e = Notes.entry(s); return e && (e.star || e.note); });
    const orph = Notes.orphans();
    const cur = f?.steps[S.cur];
    p.innerHTML = `<h3>Bookmarks and notes</h3>
      ${items.length ? `<ul>${items.map((s) => { const e = Notes.entry(s); return `<li><button type="button" class="go" data-go="${s.idx}"><span class="bm-n">${e.star ? '★' : '✎'} ${s.n}</span> &middot; ${esc(route(s))}<span class="bm-note">${esc(e.note || s.label.join(' '))}</span></button></li>`; }).join('')}</ul>` : '<div class="empty">No bookmarks yet. Press <span class="kbd">B</span> on a step to star it, or <span class="kbd">N</span> to write a note.</div>'}
      ${orph.length ? `<h3>Notes for changed steps</h3><ul>${orph.map(([k, e]) => `<li class="orphan"><div><b>${esc(e.route || '')}</b> &middot; ${esc(e.label || '')}<span class="bm-note">${e.star ? '★ ' : ''}${esc(e.note || '')}</span></div>${cur ? `<button type="button" class="btn" data-attach="${esc(k)}" title="Move to step ${cur.n}">Move to step ${cur.n}</button>` : ''}<button type="button" class="btn" data-del="${esc(k)}" aria-label="Delete this note">Delete</button></li>`).join('')}</ul>` : ''}
      ${Store.ok ? '' : '<div class="empty">Storage is blocked here, so notes last only for this session. Export them to keep them.</div>'}
      <div class="row"><button type="button" class="btn" data-np="export">Export notes</button><button type="button" class="btn" data-np="import">Import notes</button>
      ${Object.keys(Notes.data).length ? `<button type="button" class="btn" data-np="clear">${this.confirmClear ? 'Click again to delete all' : 'Delete all'}</button>` : ''}</div>`;
  },
  click(ev) {
    const b = ev.target.closest('button');
    if (!b || !this.node?.contains(b)) return;
    if (b.dataset.go) { Walk.go(+b.dataset.go); this.close(); }
    else if (b.dataset.attach) Notes.attach(b.dataset.attach, S.flow.steps[S.cur]);
    else if (b.dataset.del) Notes.remove(b.dataset.del);
    else if (b.dataset.np === 'export') Exporter.notes();
    else if (b.dataset.np === 'import') document.getElementById('notesInput').click();
    else if (b.dataset.np === 'clear') {
      if (this.confirmClear) { Notes.clearAll(); this.confirmClear = false; } else { this.confirmClear = true; this.render(); }
    }
  },
};

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
    if (changed) S.noteOpen = false;
    Hl.apply(i);
    this.render(opts.animate === false ? null : dir);
    Chapters.render();
    Follow.renderStrip();
    Table.markCurrent();
    Editor.markStep(opts.from === 'editor');
    if (opts.camera !== false && i >= 0 && S.view === 'diagram') Camera.followStep(S.flow.steps[i]);
    if (changed) this.announce();
  },
  next() { if (S.cur < this.count() - 1) this.go(S.cur + 1); },
  prev() { if (S.cur >= 0) this.go(S.cur - 1); },
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
      box.className = 'card side';
      box.dataset.step = i;
      box.tabIndex = 0;
      box.setAttribute('aria-label', `Go to step ${s.n}`);
      box.innerHTML = `<div class="side-h">Step ${s.n}</div><div class="side-r">${esc(route(s, true))}</div><div class="side-s">${esc(s.label.join(' '))}</div><div class="side-d">${esc(s.explain || '')}</div>`;
    };
    if (S.cur < 0) {
      side(el.cardPrev, -1);
      side(el.cardNext, 0);
      const chaps = f.sections.length ? ` in ${f.sections.length} chapters` : '';
      el.cardCur.innerHTML = `<div class="overview"><h3>${esc(f.title)}</h3>
        <p>${n} steps, ${f.participants.length} layers${chaps}. Press <span class="kbd">&rarr;</span> to start, or click any arrow.</p>
        <div class="layers">${f.participants.map((p) => `<span title="${esc(f.layers[p.alias]?.desc || '')}"><b>${esc(p.name)}</b></span>`).join('')}</div></div>`;
    } else {
      side(el.cardPrev, S.cur - 1);
      side(el.cardNext, S.cur + 1);
      el.cardCur.innerHTML = this.centerHTML(f.steps[S.cur]);
      this.bindCenter();
    }
    if (dir) {
      el.cards.classList.remove('slide-next', 'slide-prev');
      void el.cards.offsetWidth;
      el.cards.classList.add(dir === 'next' ? 'slide-next' : 'slide-prev');
    }
  },
  centerHTML(s) {
    const f = S.flow;
    const sec = f.sections[s.section];
    const inSec = sec ? `<span>&middot; ${s.idx - sec.firstStep + 1} of ${sec.count} in <b>${esc(sec.name)}</b></span>` : '';
    const chips = s.branch.map((b) => `<span class="chip br" title="${esc(b.kind + ' ' + b.label)}"><b>${esc(b.kind)}</b> ${esc(b.label)}</span>`).join('');
    const e = Notes.entry(s) || {};
    const sends = s.label.map((l) => `<span class="mk">${tokHTML(l)}</span>`).join('<br>');
    const does = s.explain
      ? `<p class="does">${tokHTML(s.explain, true)}</p>`
      : `<p class="does fallback">${s.kind === 'self' ? esc(s.fromName) + ' works on its own here' : 'Sends this from ' + esc(s.fromName) + ' to ' + esc(s.toName)}. No explanation yet.</p>`;
    const extra = [];
    if (s.payload) extra.push(`<details id="payloadBox"><summary>Show payload</summary><pre>${tokHTML(s.payload)}</pre></details>`);
    for (const r of s.refs) {
      extra.push(/^https?:\/\//i.test(r)
        ? `<a class="ref" href="${esc(r)}" target="_blank" rel="noopener noreferrer">${esc(r.replace(/^https?:\/\//, ''))}</a>`
        : `<span class="ref" title="Source">${esc(r)}</span>`);
    }
    let note = '';
    if (S.noteOpen) {
      note = `<div class="note-edit"><textarea id="noteTa" aria-label="Your note for step ${s.n}" placeholder="Your note (only in this browser)">${esc(e.note || '')}</textarea><span class="hint">Saved as you type. Only in this browser${Store.ok ? '' : ' (storage is blocked, so only for this session)'}.</span></div>`;
    } else if (e.note) {
      note = `<div class="note-view"><b>Your note:</b> ${esc(e.note)}</div>`;
    }
    return `<div class="c-top">
        <span class="count">Step <input id="stepInput" type="text" inputmode="numeric" value="${s.n}" aria-label="Step number, type to jump"> of ${f.steps.length}</span>
        ${inSec}${chips}<span class="spacer"></span>
        <button type="button" class="ibtn" id="starBtn" aria-pressed="${!!e.star}" aria-label="Bookmark this step (B)" title="Bookmark (B)">${e.star ? '★' : '☆'}</button>
        <button type="button" class="ibtn" id="noteBtn" aria-pressed="${S.noteOpen}" aria-label="Write a note (N)" title="Note (N)">✎</button>
      </div>
      <div class="route">${s.kind === 'self' ? `<span>${esc(s.fromName)}</span><span class="arrow">↻ itself</span>` : `<span>${esc(s.fromName)}</span><span class="arrow">──►</span><span>${esc(s.toName)}</span>`}<span class="chip k-${s.kind}">${s.kind}</span></div>
      <div class="sends" aria-label="What it sends">${sends}</div>
      ${does}
      ${extra.length ? `<div class="c-extra">${extra.join('')}</div>` : ''}
      ${note}`;
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
/** Escapes text and wraps followable tokens so a click starts Follow a value. */
function tokHTML(text, plain) {
  if (plain) return esc(text);
  let out = '', last = 0;
  const on = Follow.tok;
  for (const m of String(text).matchAll(TOKEN_RE)) {
    out += esc(text.slice(last, m.index));
    const t = m[0];
    out += isFollowable(t) ? `<span class="tok${on && t.toLowerCase() === on ? ' on' : ''}" data-tok="${esc(t)}" title="Follow this value">${esc(t)}</span>` : esc(t);
    last = m.index + t.length;
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
    el.chapters.innerHTML = secs.map((s, i) => `${i ? '<span class="sep" aria-hidden="true">&middot;</span>' : ''}<button type="button" data-sec="${i}" class="${i === cur ? 'cur' : ''}" ${i === cur ? 'aria-current="step"' : ''} title="${s.count} step${s.count === 1 ? '' : 's'}, from step ${s.firstStep + 1}">${esc(s.name)}</button>`).join('');
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
      ? f.steps.filter((s) => [s.label.join(' '), s.explain, s.payload, s.fromName, s.toName, f.sections[s.section]?.name || ''].join(' \n ').toLowerCase().includes(this.q)).map((s) => s.idx)
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
    if (this.alias) {
      const name = S.flow.layers[this.alias]?.name || this.alias;
      const cnt = S.flow.steps.filter((s) => s.from === this.alias || s.to === this.alias).length;
      Shell.notice(`Showing only the ${cnt} arrows of <b>${esc(name)}</b>. <button type="button" class="btn" data-act="spot-clear" style="height:24px;margin-left:6px">Show all</button>`);
    } else Shell.notice(null);
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
      if (S.cur >= Walk.count() - 1) { this.stop(); return; }
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
    if (best.k !== 'swv:notes:' + prev) Shell.toast(`Your notes moved with this flow (${best.hits} step${best.hits === 1 ? '' : 's'})`);
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

/* ===================== Glossary: @term lines in the code plus answers saved from Ask AI ===================== */
const Glossary = {
  id: '', saved: {}, map: new Map(), _re: null, _reKey: '',
  load(f) {
    if (!f?.isSequence) { this.map = new Map(); this._re = null; return; }
    const id = Notes.flowId(f);
    if (id !== this.id) { this.id = id; this.saved = Store.get('swv:terms:' + id, {}) || {}; }
    this.refresh();
  },
  refresh() {
    const m = new Map();
    for (const [k, v] of Object.entries(this.saved)) m.set(k, { term: v.term, def: v.def, source: 'ai', updated: v.updated });
    for (const t of S.flow?.terms || []) m.set(t.term.toLowerCase(), { term: t.term, def: t.def, source: 'code', line: t.line });
    this.map = m;
    const key = [...m.keys()].sort().join('|');
    if (key !== this._reKey) {
      this._reKey = key;
      const parts = [...m.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      this._re = parts.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${parts.join('|')})(?![\\p{L}\\p{N}_])`, 'giu') : null;
    }
  },
  size() { return this.map.size; },
  regex() { return this._re || /$^/g; },
  lookup(word) { return this.map.get(String(word || '').toLowerCase()) || null; },
  all() { return [...this.map.values()].sort((a, b) => a.term.localeCompare(b.term)); },
  add(term, def) {
    term = String(term || '').trim();
    def = String(def || '').trim();
    if (!term || !def) return;
    this.saved[term.toLowerCase()] = { term, def, updated: new Date().toISOString() };
    this.persist();
  },
  remove(term) { delete this.saved[String(term).toLowerCase()]; this.persist(); },
  persist() {
    Store.set('swv:terms:' + this.id, this.saved);
    this.refresh();
    Walk.render(null);
    Insight.render();
  },
};

/* ===================== Insight panel: the whole flow at a glance ===================== */
const Insight = {
  tab: 'layers',
  TABS: [['layers', 'Layers'], ['endpoints', 'Endpoints'], ['errors', 'Errors'], ['behind', 'Behind the scenes'], ['glossary', 'Glossary'], ['data', 'Data']],
  toggle(on, tab) {
    S.insightOpen = on ?? !S.insightOpen;
    if (tab) this.tab = tab;
    el.insightPanel.hidden = !S.insightOpen;
    el.insightBtn.setAttribute('aria-pressed', S.insightOpen);
    document.body.classList.toggle('insight-open', S.insightOpen);
    if (S.insightOpen) { this.render(); el.insightBody.querySelector('button, a')?.focus({ preventScroll: true }); }
    else el.canvas.focus({ preventScroll: true });
    requestAnimationFrame(() => { Camera.clampPos(); Camera.apply(); });
  },
  show(tab) { this.toggle(true, tab); },
  render() {
    if (!S.insightOpen) return;
    const f = S.flow;
    el.insightTabs.innerHTML = this.TABS.map(([k, label]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === this.tab}">${label}${this.badge(k)}</button>`).join('');
    if (!f?.isSequence) { el.insightBody.innerHTML = '<p class="muted">The Insight panel works with sequence diagrams.</p>'; return; }
    el.insightBody.innerHTML = this[this.tab]();
    this.markCurrent();
  },
  badge(tab) {
    const f = S.flow;
    if (!f?.isSequence) return '';
    const n = { layers: f.participants.length, endpoints: this.endpointList().length, errors: f.steps.filter((s) => s.isError).length + f.unconfirmed, behind: f.uses.length + f.effects.length, glossary: Glossary.size(), data: f.data.length }[tab];
    return n ? ` <span class="n">${n}</span>` : '';
  },
  markCurrent() {
    if (!S.insightOpen) return;
    for (const b of el.insightBody.querySelectorAll('[data-go]')) b.classList.toggle('cur', +b.dataset.go === S.cur);
  },
  go(i) { return `<button type="button" class="step-link" data-go="${i}">step ${i + 1}</button>`; },
  layers() {
    const f = S.flow;
    return `<ul class="il">${f.participants.map((p) => {
      const l = f.layers[p.alias];
      const steps = f.steps.filter((s) => s.from === p.alias || s.to === p.alias);
      const sent = f.steps.filter((s) => s.from === p.alias);
      const chapters = [...new Set(steps.map((s) => f.sections[s.section]?.name).filter(Boolean))];
      const files = [...new Set(sent.flatMap((s) => s.refs).filter((r) => !/^https?:/.test(r)).map((r) => r.replace(/:\d+(-\d+)?$/, '')))];
      const uses = [...new Set(sent.flatMap((s) => s.uses.map((u) => `${u.kind} ${u.name}`)))];
      return `<li class="${Spot.alias === p.alias ? 'on' : ''}">
        <div class="il-h">${l.icon ? `<span class="icon" aria-hidden="true">${l.icon}</span>` : ''}<b>${esc(p.name)}</b>${l.kind ? `<span class="chip kd">${esc(l.kind)}</span>` : ''}<span class="muted">${esc(p.alias)}</span>
          <button type="button" class="btn sm" data-spot="${esc(p.alias)}">${Spot.alias === p.alias ? 'Show all' : 'Only this layer'}</button></div>
        <p>${l.desc ? termHTML(l.desc) : '<span class="muted">No @layer description.</span>'}</p>
        <div class="il-meta">${plural(steps.length, 'step')}${chapters.length ? ' · ' + chapters.map(esc).join(', ') : ''}</div>
        ${files.length ? `<div class="il-meta">Files: ${files.map((x) => `<span class="ref">${esc(x)}</span>`).join(' ')}</div>` : ''}
        ${uses.length ? `<div class="il-meta">Uses: ${uses.map((x) => `<span class="chip kd">${esc(x)}</span>`).join(' ')}</div>` : ''}
      </li>`;
    }).join('')}</ul>
    ${f.boundaries.length ? `<p class="muted">Trust boundaries: ${f.boundaries.map((b) => `${esc(f.layers[b.left].name)} │ ${esc(f.layers[b.right].name)}`).join('; ')}.</p>` : '<p class="muted">Add <span class="mono">kind=</span> to the @layer lines to get icons and trust-boundary lines.</p>'}`;
  },
  endpointList() {
    const f = S.flow;
    const map = new Map();
    for (const s of f?.steps || []) {
      if (!s.http) continue;
      const k = `${s.http.method} ${s.http.path}`;
      const e = map.get(k) || { key: k, method: s.http.method, path: s.http.path, steps: [], replies: [] };
      e.steps.push(s.idx);
      e.replies.push(...s.replies);
      map.set(k, e);
    }
    return [...map.values()];
  },
  endpoints() {
    const f = S.flow;
    const list = this.endpointList();
    if (!list.length) return '<p class="muted">No arrow label starts with an HTTP method and a path yet.</p>';
    return `<table class="it"><thead><tr><th>Call</th><th>From → To</th><th>Replies</th></tr></thead><tbody>${list.map((e) => {
      const first = f.steps[e.steps[0]];
      return `<tr><td><span class="method m-${e.method.toLowerCase()}">${e.method}</span> <span class="mono">${esc(e.path)}</span><div class="muted">${e.steps.map((i) => this.go(i)).join(' ')}</div></td>
        <td>${esc(first.fromName)} → ${esc(first.toName)}</td>
        <td>${e.replies.length ? e.replies.map((i) => { const r = f.steps[i]; return `<button type="button" class="chip st s-${statusClass(r)}" data-go="${i}">${esc(r.label[0])}</button>`; }).join(' ') : '<span class="muted">no reply arrow</span>'}</td></tr>`;
    }).join('')}</tbody></table>`;
  },
  errors() {
    const f = S.flow;
    const errs = f.steps.filter((s) => s.isError);
    const unc = f.steps.filter((s) => s.unconfirmed.length);
    let html = errs.length
      ? `<table class="it"><thead><tr><th>Status</th><th>Message</th><th>When</th><th>Cause</th></tr></thead><tbody>${errs.map((s) => `<tr><td><button type="button" class="chip st s-${statusClass(s)}" data-go="${s.idx}">${s.status.code}</button></td><td>${esc([s.status.reason, ...s.label.slice(1)].filter(Boolean).join(' '))}<div class="muted">${this.go(s.idx)} · ${esc(s.fromName)} → ${esc(s.toName)}</div></td><td>${s.branch.map((b) => `<span class="chip br"><b>${esc(b.kind)}</b> ${esc(b.label)}</span>`).join(' ') || '<span class="muted">always</span>'}</td><td>${termHTML(s.explain || '')}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">No reply with a 4xx or 5xx status in this flow.</p>';
    if (unc.length) html += `<h3>Not confirmed from the code</h3><ul class="il">${unc.map((s) => `<li>${this.go(s.idx)} ${s.unconfirmed.map(esc).join('<br>')}</li>`).join('')}</ul>`;
    if (f.proposed) html += '<p class="warn-line"><b>Proposed design:</b> none of these steps exist in the code yet.</p>';
    return html;
  },
  behind() {
    const f = S.flow;
    if (!f.uses.length && !f.effects.length) return '<p class="muted">No <span class="mono">@uses</span> or <span class="mono">@effect</span> lines yet. They list the hooks, crons, utilities, config and side effects that take part without being a layer.</p>';
    const byKind = {};
    for (const u of f.uses) (byKind[u.kind] ||= []).push(u);
    let html = Object.entries(byKind).map(([kind, items]) => `<details open><summary><span class="chip kd">${esc(kind)}</span> ${plural(items.length, 'item')}</summary><ul class="il">${items.map((u) => `<li><b>${esc(u.name)}</b>${u.ref ? ` <span class="ref">${esc(u.ref)}</span>` : ''}${u.text ? `<p>${termHTML(u.text)}</p>` : ''}<div class="il-meta">${u.steps.map((i) => this.go(i)).join(' ')}</div></li>`).join('')}</ul></details>`).join('');
    if (f.effects.length) html += `<details open><summary><span class="chip ef">effects</span> ${plural(f.effects.length, 'item')}</summary><ul class="il">${f.effects.map((e) => `<li>${termHTML(e.text)} <span class="il-meta">${this.go(e.step)}</span></li>`).join('')}</ul></details>`;
    return html;
  },
  glossary() {
    const all = Glossary.all();
    const list = all.length
      ? `<dl class="gl">${all.map((t) => `<div class="gl-row"><dt>${esc(t.term)} ${t.source === 'ai' ? '<span class="chip">saved answer</span>' : ''}</dt><dd>${esc(t.def)}${t.source === 'ai' ? `<div class="gl-act"><button type="button" class="btn sm" data-term-edit="${esc(t.term)}">Edit</button><button type="button" class="btn sm" data-term-del="${esc(t.term)}">Delete</button></div>` : ''}</dd></div>`).join('')}</dl>`
      : '<p class="muted">No terms yet. The skill writes <span class="mono">%% @term word: definition</span> lines; answers you save from Ask AI land here too.</p>';
    return `${list}<form class="gl-add" id="glAdd"><input name="term" placeholder="Term" aria-label="Term" required><input name="def" placeholder="Definition in one sentence" aria-label="Definition" required><button type="submit" class="btn">Add</button></form>
      <p class="muted">Saved terms stay in this browser. Underlined words on the cards open their definition.</p>`;
  },
  data() {
    const f = S.flow;
    const files = new Map();
    for (const s of f.steps) for (const r of s.refs) { if (/^https?:/.test(r)) continue; const p = r.replace(/:\d+(-\d+)?$/, ''); (files.get(p) || files.set(p, []).get(p)).push(s.idx); }
    let html = f.data.length
      ? `<h3>Tables touched</h3><table class="it"><thead><tr><th>Table</th><th>Operations</th><th>Steps</th></tr></thead><tbody>${f.data.map((d) => `<tr><td class="mono">${esc(d.table)}</td><td>${d.ops.map((o) => `<span class="chip">${esc(o)}</span>`).join(' ')}</td><td>${d.steps.map((i) => this.go(i)).join(' ')}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">No SQL found in payloads or labels. Write queries as <span class="mono">@payload.sql …</span> to list the tables here.</p>';
    html += files.size
      ? `<h3>Files in this flow</h3><ul class="il">${[...files.entries()].sort().map(([p, steps]) => `<li><span class="ref">${esc(p)}</span> <span class="il-meta">${[...new Set(steps)].map((i) => this.go(i)).join(' ')}</span></li>`).join('')}</ul>`
      : '<h3>Files in this flow</h3><p class="muted">No @ref lines yet.</p>';
    return html;
  },
  click(ev) {
    const t = ev.target;
    const tab = t.closest('[data-tab]');
    if (tab) { this.tab = tab.dataset.tab; this.render(); return; }
    const spot = t.closest('[data-spot]');
    if (spot) { Spot.toggle(spot.dataset.spot); this.render(); return; }
    const go = t.closest('[data-go]');
    if (go) { Walk.go(+go.dataset.go); return; }
    const del = t.closest('[data-term-del]');
    if (del) { Glossary.remove(del.dataset.termDel); return; }
    const edit = t.closest('[data-term-edit]');
    if (edit) {
      const e = Glossary.lookup(edit.dataset.termEdit);
      Modal.prompt('Edit definition', e?.def || '', (v) => Glossary.add(e.term, v));
    }
  },
  submit(ev) {
    const form = ev.target.closest('#glAdd');
    if (!form) return;
    ev.preventDefault();
    Glossary.add(form.term.value, form.def.value);
    form.reset();
  },
};

/* ===================== "Behind the scenes" popover in the step bar ===================== */
const BehindPop = {
  node: null,
  open() {
    this.close();
    const f = S.flow;
    if (!f?.isSequence) return;
    const p = document.createElement('div');
    p.className = 'pop behind';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Behind the scenes');
    const byKind = {};
    for (const u of f.uses) (byKind[u.kind] ||= []).push(u);
    const cur = f.steps[S.cur];
    p.innerHTML = `<h3>Behind the scenes</h3>
      <p class="empty" style="padding-top:0">Parts that take part without being a layer. ${cur ? `Step ${cur.n} uses ${cur.uses.length ? usesSummary(cur.uses) : 'none of them'}.` : ''}</p>
      ${Object.entries(byKind).map(([kind, items]) => `<details ${cur && cur.uses.some((u) => u.kind === kind) ? 'open' : ''}><summary><span class="chip kd">${esc(kind)}</span> ${plural(items.length, 'item')}</summary><ul>${items.map((u) => `<li class="bh"><div><b>${esc(u.name)}</b>${u.ref ? ` <span class="ref">${esc(u.ref)}</span>` : ''}<span class="bm-note" style="white-space:normal">${esc(u.text || '')}</span></div><div class="bh-steps">${u.steps.map((i) => `<button type="button" class="step-link${i === S.cur ? ' cur' : ''}" data-go="${i}">${i + 1}</button>`).join(' ')}</div></li>`).join('')}</ul></details>`).join('')}
      ${f.effects.length ? `<details ${cur && cur.effects.length ? 'open' : ''}><summary><span class="chip ef">effects</span> ${plural(f.effects.length, 'item')}</summary><ul>${f.effects.map((e) => `<li class="bh"><div>${esc(e.text)}</div><div class="bh-steps"><button type="button" class="step-link${e.step === S.cur ? ' cur' : ''}" data-go="${e.step}">${e.step + 1}</button></div></li>`).join('')}</ul></details>` : ''}
      ${!f.uses.length && !f.effects.length ? '<div class="empty">Nothing listed yet. The skill writes <span class="mono">%% @uses hook useCart src/hooks/useCart.ts:12 …</span> above the step where a hook, cron, util, config or env value takes part.</div>' : ''}
      <div class="row"><button type="button" class="btn" data-open="behind">Open in the Insight panel</button></div>`;
    document.body.appendChild(p);
    this.node = p;
    const r = el.behindBtn.getBoundingClientRect();
    p.style.right = Math.max(16, window.innerWidth - r.right) + 'px';
    p.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    el.behindBtn.setAttribute('aria-expanded', 'true');
    p.querySelector('button')?.focus();
  },
  close() { this.node?.remove(); this.node = null; el.behindBtn?.setAttribute('aria-expanded', 'false'); },
  click(ev) {
    const b = ev.target.closest('button');
    if (!b || !this.node?.contains(b)) return;
    if (b.dataset.go) { Walk.go(+b.dataset.go); }
    else if (b.dataset.open) { this.close(); Insight.show(b.dataset.open); }
  },
  ui() {
    const f = S.flow;
    const n = f?.isSequence ? f.uses.length + f.effects.length : 0;
    el.behindBtn.hidden = !n;
    el.behindBtn.innerHTML = `&#9881; Behind <span class="n">${n}</span>`;
  },
};

/* ===================== Term popover: a definition, with a way to ask for more ===================== */
const TermPop = {
  node: null,
  open(term, x, y) {
    this.close();
    const e = Glossary.lookup(term);
    if (!e) return;
    const n = document.createElement('div');
    n.className = 'pop term-pop';
    n.setAttribute('role', 'dialog');
    n.innerHTML = `<h3>${esc(e.term)} ${e.source === 'ai' ? '<span class="chip">saved answer</span>' : ''}</h3><p>${esc(e.def)}</p>
      <div class="row"><button type="button" class="btn" data-ask="${esc(e.term)}">Ask AI more</button><button type="button" class="btn" data-follow="${esc(e.term)}">Follow in the flow</button>${e.source === 'ai' ? `<button type="button" class="btn" data-del="${esc(e.term)}">Delete</button>` : ''}</div>`;
    document.body.appendChild(n);
    n.style.left = clamp(x - 20, 8, window.innerWidth - n.offsetWidth - 8) + 'px';
    n.style.top = Math.max(8, y - n.offsetHeight - 10) + 'px';
    this.node = n;
    n.querySelector('button')?.focus();
  },
  close() { this.node?.remove(); this.node = null; },
  click(ev) {
    const b = ev.target.closest('button');
    if (!b || !this.node?.contains(b)) return;
    if (b.dataset.ask) { this.close(); Ask.term(b.dataset.ask); }
    else if (b.dataset.follow) { this.close(); Follow.start(b.dataset.follow); }
    else if (b.dataset.del) { this.close(); Glossary.remove(b.dataset.del); }
  },
};

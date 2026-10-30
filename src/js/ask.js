/* ===================== Ask AI: short answers about a step or a term ===================== */
/* The page has no server, so the key the person enters stays in this browser and goes only to the
   provider they picked. Every provider here speaks the OpenAI chat-completions shape, except the
   Claude artifact capability, which the claude.ai viewer grants without a key. */
const AI_PROVIDERS = {
  groq: { name: 'Groq (free tier)', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', key: true, keys: 'https://console.groq.com/keys' },
  gemini: { name: 'Google Gemini (free tier)', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', key: true, keys: 'https://aistudio.google.com/apikey' },
  openrouter: { name: 'OpenRouter (free models)', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.3-70b-instruct:free', key: true, keys: 'https://openrouter.ai/keys' },
  cerebras: { name: 'Cerebras (free tier)', url: 'https://api.cerebras.ai/v1/chat/completions', model: 'llama-3.3-70b', key: true, keys: 'https://cloud.cerebras.ai' },
  mistral: { name: 'Mistral (free tier)', url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest', key: true, keys: 'https://console.mistral.ai/api-keys' },
  ollama: { name: 'Ollama on this computer (no key)', url: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2', key: false },
  custom: { name: 'Custom OpenAI-compatible endpoint', url: '', model: '', key: true },
  claude: { name: 'Claude (only when this page runs as a Claude artifact)', key: false, artifact: true },
};
const AI_SYSTEM = `You explain one step of a software flow to a developer who is new to this codebase.
Rules: answer in under 60 words. Be as exact as a senior engineer; never invent details about the project.
Use plain words; if you must use a technical term, add two or three words saying what it is.
Give one concrete example when it helps. No greetings, no lists unless asked, no repeating the question.
If the question is about something the context does not cover, say "Not in this diagram:" and then give the general meaning in one sentence.`;

const Ask = {
  open: false, busy: false, last: null, abort: null,
  settings: Object.assign({ provider: 'groq', keys: {}, models: {}, customUrl: '', includePayload: true, autoNote: true, mode: 'project' }, Store.get('swv:ai', {})),
  save() { Store.set('swv:ai', this.settings); },
  provider() { return AI_PROVIDERS[this.settings.provider] || AI_PROVIDERS.groq; },
  ready() {
    const p = this.provider();
    if (p.artifact) return !!(window.claude && typeof window.claude.use === 'function');
    if (this.settings.provider === 'custom' && !this.settings.customUrl) return false;
    return !p.key || !!this.settings.keys[this.settings.provider];
  },
  toggle(on) {
    if (S.cur < 0) { Shell.toast('Pick a step first, then ask about it'); return; }
    this.open = on ?? !this.open;
    Walk.render(null);
    if (this.open) $('#askInput')?.focus();
  },
  close(render = true) { if (!this.open) return; this.open = false; this.last = null; if (render) Walk.render(null); },
  /** Opens the panel with a "What is …?" question for a word on the card or in the Follow strip. */
  term(word) {
    if (S.cur < 0) { Shell.toast('Pick a step first, then ask about a word in it'); return; }
    this.open = true;
    Walk.render(null);
    this.run(`What is "${word}" here?`, { term: word });
  },
  /** Draws the panel into the card. Called from Walk.render. */
  mount() {
    const box = $('#askBox');
    if (!box) return;
    if (!this.open) { box.innerHTML = ''; return; }
    const s = S.flow.steps[S.cur];
    // Suggested words: names from the label, technical-looking tokens from the text (CamelCase, paths, headers, SQL
    // keywords, snake_case) and glossary terms, never everyday words.
    const techy = (t) => /[A-Za-z]/.test(t) && !/^\d+$/.test(t) && !/^(GET|POST|PUT|PATCH|DELETE)$/.test(t)
      && (/[_/\-.]|\d/.test(t) || /^[A-Z]{2,}$/.test(t) || /[a-z][A-Z]/.test(t));
    const fromLabel = tokens(s.label.join(' ')).filter((t) => isFollowable(t) && techy(t));
    const fromText = tokens(s.explain).filter((t) => isFollowable(t) && techy(t));
    const fromTerms = Glossary.all().filter((t) => t.source === 'code' && (s.label.join(' ') + ' ' + s.explain).toLowerCase().includes(t.term.toLowerCase())).map((t) => t.term);
    const words = [...new Set([...fromTerms, ...fromLabel, ...fromText])].slice(0, 6);
    const st = this.settings;
    const p = this.provider();
    const chips = ['Explain simpler', 'Why this step?', 'What if it fails?', ...words.map((w) => `What is ${w}?`)];
    const setup = this.ready() ? '' : `<p class="ask-setup">No AI provider set up yet. <button type="button" class="link" data-ask-settings>Choose a free provider and add its key</button>. ${p.artifact ? 'The Claude provider only works when this page is opened as a Claude artifact.' : ''}</p>`;
    const ans = this.last ? `<div class="ask-answer ${this.last.error ? 'err' : ''}"><div class="ask-q">${esc(this.last.q)}</div><div class="ask-a">${this.last.busy ? 'Thinking…' : esc(this.last.a)}</div>
        ${!this.last.busy && !this.last.error ? `<div class="ask-act">${this.last.term ? `<button type="button" class="btn sm" data-ask-term="${esc(this.last.term)}">Add to glossary</button>` : ''}${st.autoNote ? '<span class="hint">Saved to this step\'s note (edit with N).</span>' : `<button type="button" class="btn sm" data-ask-note>Save to note</button>`}<button type="button" class="btn sm" data-ask-copy>Copy</button></div>` : ''}</div>` : '';
    box.innerHTML = `<div class="ask">
      <div class="ask-top"><b>Ask about step ${s.n}</b>
        <span class="seg sm" role="group" aria-label="Question mode"><button type="button" data-ask-mode="project" aria-pressed="${st.mode === 'project'}" title="The answer uses this step's label, text, payload and layers">In this project</button><button type="button" data-ask-mode="general" aria-pressed="${st.mode === 'general'}" title="Only the question is sent">In general</button></span>
        <span class="spacer"></span><button type="button" class="link" data-ask-settings title="Provider, key, model">${esc(p.name.split(' (')[0])} ⚙</button><button type="button" class="ibtn" data-ask-close aria-label="Close">×</button></div>
      ${setup}
      <div class="ask-chips">${chips.map((c) => `<button type="button" class="chip q" data-ask-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <form class="ask-form" id="askForm"><input id="askInput" autocomplete="off" placeholder="Your question about this step…" aria-label="Question"><button type="submit" class="btn primary" ${this.busy ? 'disabled' : ''}>Ask</button></form>
      ${ans}
      <div class="hint">${st.mode === 'project' ? `Sends the step's label, explanation${st.includePayload ? ', payload' : ''} and layer descriptions` : 'Sends only the question'} to ${esc(p.name.split(' (')[0])}. Answers under 60 words.</div>
    </div>`;
  },
  /** Context block for project mode: what the model needs, nothing more. */
  context(s) {
    const f = S.flow;
    const sec = f.sections[s.section];
    const lines = [`Flow: ${f.title}${f.proposed ? ' (a proposed design, not existing code)' : ''}`];
    if (sec) lines.push(`Chapter: ${sec.name}${sec.summary ? ' – ' + sec.summary : ''}`);
    lines.push(`Step ${s.n} of ${f.steps.length}: ${s.fromName} → ${s.toName} (${s.kind})`);
    lines.push(`Label: ${s.label.join(' | ')}`);
    if (s.explain) lines.push(`Explanation: ${s.explain}`);
    if (s.branch.length) lines.push(`Branch: ${s.branch.map((b) => b.kind + ' ' + b.label).join(' > ')}`);
    for (const a of [s.from, s.to]) { const l = f.layers[a]; if (l?.desc) lines.push(`Layer ${l.name}: ${l.desc}`); }
    if (this.settings.includePayload && s.payload) lines.push(`Payload: ${s.payload.slice(0, 1200)}`);
    if (s.uses.length) lines.push(`Also involved: ${s.uses.map((u) => `${u.kind} ${u.name} ${u.text}`).join('; ')}`);
    if (s.effects.length) lines.push(`Effects: ${s.effects.join('; ')}`);
    const terms = Glossary.all().filter((t) => t.source === 'code' && new RegExp(t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(s.label.join(' ') + ' ' + s.explain));
    if (terms.length) lines.push(`Glossary: ${terms.map((t) => `${t.term}: ${t.def}`).join('; ')}`);
    return lines.join('\n');
  },
  async run(question, opts = {}) {
    const q = String(question || '').trim();
    const s = S.flow?.steps[S.cur];
    if (!q || !s) return;
    if (!this.ready()) { this.settingsModal(); return; }
    this.last = { q, a: '', busy: true, term: opts.term || null, step: s.key };
    this.busy = true;
    this.mount();
    const user = this.settings.mode === 'project' ? `Context:\n${this.context(s)}\n\nQuestion: ${q}` : `Question: ${q}`;
    const cacheKey = 'swv:ai:cache';
    const cache = Store.get(cacheKey, {}) || {};
    const h = hashStr(this.settings.provider + '|' + user);
    try {
      let text = cache[h]?.a;
      if (!text) {
        text = await this.complete(user);
        cache[h] = { a: text, t: Date.now() };
        const keys = Object.keys(cache);
        if (keys.length > 200) for (const k of keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - 200)) delete cache[k];
        Store.set(cacheKey, cache);
      }
      this.last = { ...this.last, a: text.trim(), busy: false };
      if (this.settings.autoNote) Notes.append(s, `Q: ${q}\nA: ${text.trim()}`);
    } catch (err) {
      const msg = String(err?.message || err);
      const cors = /failed to fetch|networkerror|load failed/i.test(msg);
      this.last = { ...this.last, busy: false, error: true, a: cors ? `Could not reach ${this.provider().name.split(' (')[0]} from this page. The provider may block browser requests; try another provider, or a proxy URL as a custom endpoint.` : msg };
    }
    this.busy = false;
    if (S.flow?.steps[S.cur]?.key === s.key) this.mount();
  },
  async complete(user) {
    const p = this.provider();
    const st = this.settings;
    const messages = [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: user }];
    if (p.artifact) {
      const sample = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('sample') : null;
      if (!sample) throw new Error('Claude is not available on this page. Open the viewer as a Claude artifact, or pick another provider.');
      const r = await sample([{ role: 'user', content: AI_SYSTEM + '\n\n' + user }], { modelTier: 'quick', cache: false });
      return r.text || '';
    }
    const url = st.provider === 'custom' ? st.customUrl : p.url;
    const model = st.models[st.provider] || p.model;
    const key = st.keys[st.provider] || '';
    this.abort?.abort();
    this.abort = new AbortController();
    const timer = setTimeout(() => this.abort.abort(), 45000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}), ...(st.provider === 'openrouter' ? { 'HTTP-Referer': location.origin || 'https://sequence-walkthrough', 'X-Title': 'Sequence Walkthrough' } : {}) },
        body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 220 }),
        signal: this.abort.signal,
      });
      if (!res.ok) {
        let detail = '';
        try { const j = await res.json(); detail = j.error?.message || j.message || JSON.stringify(j).slice(0, 200); } catch { detail = await res.text().catch(() => ''); }
        throw new Error(`${res.status} ${res.statusText}${detail ? ': ' + detail.slice(0, 240) : ''}`);
      }
      const j = await res.json();
      const text = j.choices?.[0]?.message?.content;
      if (!text) throw new Error('The provider sent no answer text');
      return text;
    } finally { clearTimeout(timer); }
  },
  settingsModal() {
    const st = this.settings;
    const opts = Object.entries(AI_PROVIDERS).map(([k, p]) => `<option value="${k}" ${k === st.provider ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    Modal.open(`<h2>Ask AI</h2>
      <p class="muted">Short answers about any step or word, from a model you choose. The key is stored only in this browser and is sent only to that provider. Check the provider's current free tier before relying on it.</p>
      <label class="opt">Provider <select id="aiProv" class="tb-sel" style="max-width:none;flex:1">${opts}</select></label>
      <div id="aiFields"></div>
      <label class="opt"><input type="checkbox" id="aiPayload" ${st.includePayload ? 'checked' : ''}> Include the step's payload in the question (project mode)</label>
      <label class="opt"><input type="checkbox" id="aiNote" ${st.autoNote ? 'checked' : ''}> Save every answer to the step's note, so it can be edited later</label>
      <p class="muted" id="aiStatus"></p>
      <div class="foot"><button type="button" class="btn" data-test>Test</button><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-save>Save</button></div>`, (m) => {
      const fields = m.querySelector('#aiFields');
      const draw = () => {
        const k = m.querySelector('#aiProv').value;
        const p = AI_PROVIDERS[k];
        fields.innerHTML = `${p.artifact ? '<p class="muted">Works only when this page is opened as a Claude artifact; the viewer asks the person for consent on the first question.</p>' : ''}
          ${k === 'custom' ? `<label class="opt">Endpoint URL <input id="aiUrl" class="tb-in" value="${esc(st.customUrl)}" placeholder="https://your-proxy.example/v1/chat/completions"></label>` : ''}
          ${p.key ? `<label class="opt">API key <input id="aiKey" class="tb-in" type="password" autocomplete="off" value="${esc(st.keys[k] || '')}" placeholder="${k === 'custom' ? 'Optional' : 'Paste the key'}"></label>${p.keys ? `<p class="muted">Get a key at <a href="${p.keys}" target="_blank" rel="noopener noreferrer">${esc(p.keys.replace(/^https?:\/\//, ''))}</a>.</p>` : ''}` : ''}
          ${!p.artifact ? `<label class="opt">Model <input id="aiModel" class="tb-in" value="${esc(st.models[k] || p.model)}" placeholder="${esc(p.model || 'model name')}"></label>` : ''}
          ${k === 'ollama' ? '<p class="muted">Start Ollama with <span class="mono">OLLAMA_ORIGINS=*</span> so this page may call it, and pull a model first (<span class="mono">ollama pull llama3.2</span>).</p>' : ''}`;
      };
      draw();
      m.querySelector('#aiProv').addEventListener('change', draw);
      const collect = () => {
        const k = m.querySelector('#aiProv').value;
        st.provider = k;
        const key = m.querySelector('#aiKey')?.value.trim();
        if (key != null) { if (key) st.keys[k] = key; else delete st.keys[k]; }
        const model = m.querySelector('#aiModel')?.value.trim();
        if (model != null) { if (model && model !== AI_PROVIDERS[k].model) st.models[k] = model; else delete st.models[k]; }
        const url = m.querySelector('#aiUrl')?.value.trim();
        if (url != null) st.customUrl = url;
        st.includePayload = m.querySelector('#aiPayload').checked;
        st.autoNote = m.querySelector('#aiNote').checked;
        this.save();
      };
      m.querySelector('[data-close]').onclick = () => Modal.close();
      m.querySelector('[data-save]').onclick = () => { collect(); Modal.close(); this.mount(); Shell.toast('AI settings saved in this browser'); };
      m.querySelector('[data-test]').onclick = async () => {
        collect();
        const status = m.querySelector('#aiStatus');
        status.textContent = 'Testing…';
        try { const t = await this.complete('Question: Reply with the single word OK.'); status.textContent = `Works. The model said: ${t.trim().slice(0, 60)}`; }
        catch (err) { status.textContent = 'Failed: ' + (err.message || err); }
      };
    });
  },
  click(ev) {
    const t = ev.target;
    if (t.closest('[data-ask-close]')) { this.close(); return true; }
    if (t.closest('[data-ask-settings]')) { this.settingsModal(); return true; }
    const mode = t.closest('[data-ask-mode]');
    if (mode) { this.settings.mode = mode.dataset.askMode; this.save(); this.mount(); return true; }
    const q = t.closest('[data-ask-q]');
    if (q) { const m = q.dataset.askQ.match(/^What is (.+)\?$/); this.run(q.dataset.askQ, { term: m ? m[1] : null }); return true; }
    if (t.closest('[data-ask-copy]') && this.last) { Files.copy(this.last.a, 'Copied the answer'); return true; }
    if (t.closest('[data-ask-note]') && this.last) { Notes.append(S.flow.steps[S.cur], `Q: ${this.last.q}\nA: ${this.last.a}`); Shell.toast('Saved to the step\'s note'); return true; }
    const term = t.closest('[data-ask-term]');
    if (term && this.last) { Glossary.add(term.dataset.askTerm, this.last.a); Shell.toast(`"${term.dataset.askTerm}" added to the glossary`); return true; }
    return false;
  },
  submit(ev) {
    const form = ev.target.closest('#askForm');
    if (!form) return;
    ev.preventDefault();
    const v = form.querySelector('#askInput').value;
    const m = v.trim().match(/^what(?:'s| is| does)\s+"?([^"?]+?)"?\s*(?:mean)?\??$/i);
    this.run(v, { term: m ? m[1].trim() : null });
  },
};

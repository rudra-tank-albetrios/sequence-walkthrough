/* ===================== Shell: messages, menus, modals ===================== */
const Shell = {
  toastTimer: 0,
  toast(msg, action) {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => { t.remove(); action.fn(); });
      t.appendChild(b);
    }
    document.body.appendChild(t);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.remove(), action ? 8000 : 3200);
  },
  notice(html) {
    el.notice.hidden = !html;
    el.notice.innerHTML = html || '';
  },
  announce(text) { el.live.textContent = ''; setTimeout(() => { el.live.textContent = text; }, 30); },
  openMenu(btn, menu) {
    const open = menu.hidden;
    this.closeMenus();
    if (!open) return;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    menu.querySelector('button, a, select')?.focus();
  },
  closeMenus() {
    let closed = false;
    for (const [b, m] of [[el.exportBtn, el.exportMenu], [el.moreBtn, el.moreMenu]]) {
      if (!m.hidden) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); closed = true; }
    }
    if (Ctx.node) { Ctx.close(); closed = true; }
    if (BmPop.node) { BmPop.close(); closed = true; }
    if (BehindPop.node) { BehindPop.close(); closed = true; }
    if (TermPop.node) { TermPop.close(); closed = true; }
    if (el.exportBtn.hidden) { // the export menu was opened from the narrow-screen menu
      el.exportBtn.hidden = false;
      el.exportMenu.removeAttribute('style');
      el.exportBtn.closest('.menu-wrap').classList.add('tb-extra');
    }
    return closed;
  },
  setHide(on) {
    S.hide = on;
    document.body.classList.toggle('hide-mode', on);
    document.getElementById('showCtrls').hidden = !on;
    if (on) {
      Play.ui();
      const req = document.documentElement.requestFullscreen;
      if (req && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => { S.enteredFs = true; }).catch(() => { S.enteredFs = false; });
      }
    } else if (document.fullscreenElement && S.enteredFs) {
      S.enteredFs = false;
      document.exitFullscreen?.().catch(() => {});
    }
    if (!on && Presenter.on) { Presenter.on = false; document.body.classList.remove('presenter'); Presenter.render(); }
    requestAnimationFrame(() => { Camera.clampPos(); Camera.apply(); });
    el.canvas.focus({ preventScroll: true });
    this.announce(on ? 'Controls hidden. Press Escape to show them.' : 'Controls shown');
  },
  /** Folds the header ('top') or the step bar ('bar') away, or brings it back. Remembered with the other settings. */
  setFold(part, folded) {
    S.settings.fold = { ...S.settings.fold, [part]: folded };
    saveSettings();
    const top = part === 'top';
    (top ? el.topbar : el.wbar).hidden = folded;
    const tab = top ? el.edgeTop : el.edgeBottom;
    const label = `${folded ? 'Show' : 'Hide'} the ${top ? 'header' : 'step bar'}`;
    tab.setAttribute('aria-expanded', !folded);
    tab.setAttribute('aria-label', label);
    tab.title = label;
    requestAnimationFrame(() => { Camera.clampPos(); Camera.apply(); });
  },
  setCode(on) {
    S.codeOpen = on;
    el.codePanel.hidden = !on;
    el.codeBtn.setAttribute('aria-expanded', on);
    document.body.classList.toggle('code-open', on);
    el.edgeLeft.setAttribute('aria-expanded', on);
    el.edgeLeft.setAttribute('aria-label', on ? 'Hide the code' : 'Show the code');
    el.edgeLeft.title = on ? 'Hide the code (C)' : 'Show the code (C)';
    if (on) {
      Editor.highlight();
      Editor.renderLint();
      Editor.markStep();
      if (!isNarrow()) el.code.focus({ preventScroll: true });
    } else el.canvas.focus({ preventScroll: true });
  },
  setView(v) {
    if (v === 'table' && !S.flow?.isSequence) { this.toast('The table works with sequence diagrams'); return; }
    S.view = v;
    el.tableView.hidden = v !== 'table';
    el.viewDiagram.setAttribute('aria-pressed', v === 'diagram');
    el.viewTable.setAttribute('aria-pressed', v === 'table');
    const mv = el.moreMenu.querySelector('[data-more="view"]');
    if (mv) mv.textContent = v === 'table' ? 'Switch to diagram view' : 'Switch to table view';
    Header.sync();
    if (v === 'table') { Table.render(); Table.markCurrent(); }
    else if (S.cur >= 0) Camera.followStep(S.flow.steps[S.cur], 0);
  },
  /** Esc closes the first of: menu, find, Ask panel, note box, Follow, spotlight, path filter, hide mode, Insight, code panel, table (mobile), then back to overview. */
  escape() {
    if (Modal.node) { Modal.close(); return; }
    if (this.closeMenus()) return;
    if (!el.findPop.hidden) { Find.close(); return; }
    if (Ask.open) { Ask.close(); return; }
    if (S.noteOpen) { Walk.toggleNote(false); return; }
    if (Follow.tok) { Follow.clear(); return; }
    if (Spot.alias) { Spot.clear(); return; }
    if (Path.mode !== 'all') { Path.set('all'); return; }
    if (S.hide) { this.setHide(false); return; }
    if (S.insightOpen) { Insight.toggle(false); return; }
    if (S.codeOpen) { this.setCode(false); return; }
    if (S.view === 'table' && isNarrow()) { this.setView('diagram'); return; }
    if (S.playing) { Play.stop(); return; }
    if (S.cur >= 0) Walk.go(-1, { camera: false });
  },
};

const Modal = {
  node: null, prevFocus: null,
  open(html, onBind) {
    this.close();
    this.prevFocus = document.activeElement;
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    scrim.addEventListener('mousedown', (ev) => { if (ev.target === scrim) this.close(); });
    document.body.appendChild(scrim);
    this.node = scrim;
    onBind?.(scrim.firstElementChild);
    (scrim.querySelector('[autofocus]') || scrim.querySelector('button, textarea, input'))?.focus();
  },
  close() {
    if (!this.node) return;
    this.node.remove();
    this.node = null;
    this.prevFocus?.focus?.({ preventScroll: true });
  },
  text(title, text) {
    this.open(`<h2>${esc(title)}</h2><textarea readonly id="mText">${esc(text)}</textarea><div class="foot"><button type="button" class="btn primary" data-close>Done</button></div>`, (m) => {
      m.querySelector('[data-close]').onclick = () => this.close();
      const ta = m.querySelector('#mText'); ta.focus(); ta.select();
    });
  },
  /** A one-field editor; calls back with the new text on Save. */
  prompt(title, value, onSave) {
    this.open(`<h2>${esc(title)}</h2><textarea id="mText" autofocus>${esc(value)}</textarea><div class="foot"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-save>Save</button></div>`, (m) => {
      m.querySelector('[data-close]').onclick = () => this.close();
      m.querySelector('[data-save]').onclick = () => { const v = m.querySelector('#mText').value; this.close(); onSave(v); };
    });
  },
  help() {
    const keys = [
      ['← →', 'Previous / next step (skips steps hidden by the path filter)'], ['Home / End', 'First / last step'], ['[ ]', 'Previous / next chapter'], ['K', 'Lock the arrow keys inside the current chapter'],
      ['Space', 'Play / pause'], ['↑ ↓', 'Scroll'], ['+ −', 'Zoom in / out'], ['0', 'Fit width'], ['F', 'Fit all'],
      ['T', 'Diagram ↔ Table'], ['I', 'Insight panel: layers, endpoints, errors, side parts, glossary, data'], ['A', 'Ask AI about the current step'],
      ['H', 'Hide controls'], ['P', 'Presenter mode: one big card, controls hidden'], ['C', 'Open / close the code panel'], ['B / N', 'Bookmark / note on the current step'],
      ['/', 'Find'], ['?', 'This help'], ['Esc', 'Close menu → find → Ask → note → Follow → spotlight → path filter → hide mode → Insight → code panel → overview'],
      ['Ctrl + wheel', 'Zoom at the pointer (or pinch)'], ['Drag', 'Move the diagram'], ['Hover an arrow', 'Its summary: explanation, status, payload, side parts, code'], ['Click an arrow', 'Jump to that step'],
      ['Wheel over the step bar', 'Previous / next step (a long card scrolls first)'], ['Drag the step bar\'s top edge', 'Change its height; double-click the edge to reset'],
      ['Edge tabs', 'Fold the header (top) or the step bar (bottom) away; the tab stays on the edge to bring it back. The tab on the code panel\'s edge closes it'],
      ['Double-click a word', 'Follow that value through the flow'], ['Click an underlined word', 'Its definition from the glossary'], ['Click a name', 'Show only that participant\'s arrows'],
    ];
    this.open(`<h2>Shortcuts</h2>
      <table>${keys.map(([k, v]) => `<tr><td><span class="kbd">${esc(k)}</span></td><td>${esc(v)}</td></tr>`).join('')}</table>
      <p class="muted" style="margin-top:12px">Annotations are Mermaid comments (spec ${VERSION.spec}): <span class="mono">%% @title</span>, <span class="mono">@layer</span>, <span class="mono">@trigger</span>, <span class="mono">@term</span>, <span class="mono">@section</span>, <span class="mono">@summary</span>, <span class="mono">@step</span>, <span class="mono">@payload.body</span>, <span class="mono">@ref</span>, <span class="mono">@uses</span>, <span class="mono">@effect</span>, <span class="mono">@field</span>, <span class="mono">@schema</span>, <span class="mono">@state</span>, <span class="mono">@unconfirmed</span> and the chips <span class="mono">@async @retry @timeout @idempotent</span>. Notes, bookmarks, saved terms and AI keys stay in this browser.</p>
      <p class="muted">Mermaid ${VERSION.mermaid}. mermaid.live may run a different version.</p>
      <div class="foot"><button type="button" class="btn primary" data-close>Close</button></div>`, (m) => { m.querySelector('[data-close]').onclick = () => this.close(); });
  },
  /** Key points on the viewer and the sequence-walkthrough skill, with the skill download. */
  guide() {
    const k = (s) => `<span class="kbd">${s}</span>`;
    const m = (s) => `<span class="mono">${s}</span>`;
    this.open(`<h2>How it works</h2>
      <h3>The viewer</h3>
      <ul class="points">
        <li>Paste Mermaid ${m('sequenceDiagram')} code in the code panel (${k('C')}), or use Export &rarr; Paste a link or code / Open a file.</li>
        <li>Every arrow is a step. Its card comes from the ${m('%% @step')} comment above it, with the request's method and path, the reply's status code and message, and the payload parts (${m('@payload.headers')}, ${m('.body')}, ${m('.sql')}&hellip;).</li>
        <li>A request card lists its replies with their status codes; a reply card links back to its request. Hover a status code for its general meaning.</li>
        <li>Chapters (${m('@section')}) get their own colour: a light band behind the chapter's arrows with start and end markers, the progress bar and the code gutter. ${k('K')} keeps the arrow keys inside a chapter.</li>
        <li><b>Path</b> in the step bar shows the happy path only, the errors only, or one ${m('alt')} branch. <b>Behind</b> lists the hooks, crons, utilities and config (${m('@uses')}) and side effects (${m('@effect')}) that take part without being a layer.</li>
        <li>${k('I')} opens the Insight panel: layers, every endpoint with its replies, the error catalog, side parts, the glossary (${m('@term')}) and the tables touched.</li>
        <li>${k('A')} asks an AI about the current step or any word, in under 60 words. You choose a free provider and the answer is saved to the step's note. Underlined words open their definition.</li>
        <li>Walk with ${k('&larr;')} ${k('&rarr;')}, jump chapters with ${k('[')} ${k(']')}, double-click a word to follow a value, ${k('N')} adds a note, ${k('P')} is presenter mode.</li>
        <li>Arrows without an explanation are listed in the code panel. <b>Copy fix-prompt</b> hands them to Claude.</li>
        <li>Export PDF, PNG, SVG or a step table. <b>Copy viewer link</b> shares this diagram with the code inside the link; <b>Copy link to this step</b> opens on the current step.</li>
        <li>Nothing is uploaded by the viewer itself. Diagrams, notes, bookmarks, saved terms and AI keys stay in this browser; an AI question goes only to the provider you picked.</li>
      </ul>
      <h3>Set up the Claude skill (once)</h3>
      <ul class="points">
        <li><b>Download the skill</b> below: the skill, a setup guide and install scripts in one zip.</li>
        <li><b>Claude Code:</b> run ${m('install-claude-code.ps1')} (Windows) or ${m('install-claude-code.sh')} (macOS, Linux), then start a new session.</li>
        <li><b>Claude app:</b> Settings &rarr; Capabilities &rarr; turn on code execution, then Customize &rarr; Skills &rarr; + &rarr; Upload a skill &rarr; ${m('sequence-walkthrough.zip')}.</li>
        <li><b>Agent SDK or API:</b> follow ${m('SKILL-SETUP-GUIDE.md')} in the zip.</li>
      </ul>
      <h3>Use the skill</h3>
      <ul class="points">
        <li>Ask Claude: &ldquo;Make a walkthrough diagram of the login flow in ./src&rdquo;. Say &ldquo;in easy language&rdquo; for beginner wording with the same layers and steps, &ldquo;only the part after the service layer&rdquo; for a scoped cut, or &ldquo;how would I add X, give me the flow&rdquo; for a proposed design. In Claude Code you can also type ${m('/sequence-walkthrough')}.</li>
        <li>Claude replies with the code only, no file. Every call shows its method and path, every reply its status code and message, with payload parts, side parts, a glossary and code links. Paste it here and step through it.</li>
        <li>Warnings in the code panel? Copy fix-prompt, paste it to Claude, paste the answer back. Notes stay on steps that didn't change.</li>
      </ul>
      <div class="foot">
        <button type="button" class="btn" data-keys>Shortcuts</button>
        <button type="button" class="btn" data-close>Close</button>
        <button type="button" class="btn primary" data-skill autofocus>Download the skill</button>
      </div>`, (box) => {
      box.querySelector('[data-close]').onclick = () => this.close();
      box.querySelector('[data-keys]').onclick = () => this.help();
      box.querySelector('[data-skill]').onclick = async () => {
        this.close();
        try { await Exporter.skillKit(); } catch (err) { Shell.toast('Download failed: ' + (err.message || err)); }
      };
    });
  },
  importer() {
    this.open(`<h2>Import</h2><p class="muted">Paste a mermaid.live link, Mermaid code, or Markdown with a <span class="mono">\`\`\`mermaid</span> block.</p>
      <textarea id="impText" autofocus placeholder="https://mermaid.live/edit#pako:..."></textarea>
      <div class="foot"><button type="button" class="btn" data-file>Open a file…</button><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-load>Load</button></div>`, (m) => {
      m.querySelector('[data-close]').onclick = () => this.close();
      m.querySelector('[data-file]').onclick = () => { this.close(); document.getElementById('fileInput').click(); };
      m.querySelector('[data-load]').onclick = async () => { const t = m.querySelector('#impText').value; if (t.trim() && await Importer.fromText(t)) this.close(); };
    });
  },
  pdf() {
    const plan = Exporter.pdfPlan({ size: 'a4' });
    this.open(`<h2>Download PDF</h2>
      <p class="muted">Landscape pages. The participant row is repeated at the top of every page.</p>
      <label class="opt"><input type="checkbox" id="pdfTable" ${S.flow?.isSequence ? 'checked' : 'disabled'}> Add the step table at the end</label>
      <label class="opt"><input type="checkbox" id="pdfNotes"> Include my notes</label>
      <label class="opt">Paper <select id="pdfSize" class="tb-sel"><option value="a4">A4</option><option value="letter">US Letter</option></select></label>
      <p class="muted" id="pdfInfo">${plan.slices.length} diagram page${plan.slices.length === 1 ? '' : 's'}.</p>
      ${plan.slices.length > 20 ? `<p class="warn">This is a tall diagram: ${plan.slices.length} pages. Consider a PNG instead.</p>` : ''}
      <div class="foot"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-go>Download ${esc(Files.base())}.pdf</button></div>`, (m) => {
      m.querySelector('[data-close]').onclick = () => this.close();
      m.querySelector('[data-go]').onclick = async () => {
        const opts = { table: m.querySelector('#pdfTable').checked, notes: m.querySelector('#pdfNotes').checked, size: m.querySelector('#pdfSize').value };
        this.close();
        try { await Exporter.pdf(opts); } catch (err) { Shell.toast('Could not make the PDF: ' + (err.message || err)); }
      };
    });
  },
};

/* ===================== Step bar height: drag the handle on its top edge ===================== */
const BarSize = {
  min: 90,
  apply(h) {
    if (h) { el.wbar.style.setProperty('--card-h', h + 'px'); el.wbar.classList.add('sized'); }
    else { el.wbar.style.removeProperty('--card-h'); el.wbar.classList.remove('sized'); }
    requestAnimationFrame(() => { Camera.clampPos(); Camera.apply(); });
  },
  init() {
    const hd = el.wbResize;
    let drag = null;
    hd.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      drag = { y: ev.clientY, h: el.cardCur.getBoundingClientRect().height };
      try { hd.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
      document.body.classList.add('resizing');
      ev.preventDefault();
    });
    hd.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const h = Math.round(clamp(drag.h + (drag.y - ev.clientY), this.min, window.innerHeight * 0.75));
      S.settings.cardH = h;
      this.apply(h);
    });
    const end = () => { if (!drag) return; drag = null; document.body.classList.remove('resizing'); saveSettings(); };
    hd.addEventListener('pointerup', end);
    hd.addEventListener('pointercancel', end);
    hd.addEventListener('dblclick', () => { delete S.settings.cardH; saveSettings(); this.apply(0); Shell.toast('Step bar height reset'); });
    hd.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
      const cur = S.settings.cardH || el.cardCur.getBoundingClientRect().height;
      S.settings.cardH = Math.round(clamp(cur + (ev.key === 'ArrowUp' ? 20 : -20), this.min, window.innerHeight * 0.75));
      saveSettings();
      this.apply(S.settings.cardH);
      ev.preventDefault();
    });
    hd.tabIndex = 0;
    if (S.settings.cardH) this.apply(S.settings.cardH);
  },
};

/* Context menu: right-click a selected word to follow it */
const Ctx = {
  node: null,
  open(x, y, word) {
    this.close();
    const n = document.createElement('div');
    n.className = 'ctx';
    n.setAttribute('role', 'menu');
    n.innerHTML = `<button type="button" role="menuitem" data-follow>Follow “${esc(word)}”</button><button type="button" role="menuitem" data-ask>Ask AI: what is “${esc(word)}”?</button>`;
    n.style.left = Math.min(x, window.innerWidth - 260) + 'px';
    n.style.top = Math.min(y, window.innerHeight - 80) + 'px';
    n.querySelector('[data-follow]').onclick = () => { this.close(); Follow.start(word); };
    n.querySelector('[data-ask]').onclick = () => { this.close(); Ask.term(word); };
    document.body.appendChild(n);
    this.node = n;
    n.querySelector('button').focus();
  },
  close() { this.node?.remove(); this.node = null; },
};

/* ===================== App wiring ===================== */
const App = {
  debug: {},
  autosave: debounce((code) => Store.set('swv:code', code), 400),
  afterRender(first) {
    const f = S.flow;
    el.flowName.textContent = f.title;
    el.flowBadge.hidden = !f.proposed;
    document.title = f.title === DEFAULT_TITLE ? 'Sequence Walkthrough' : f.title + ' · Sequence Walkthrough';
    el.flowMeta.textContent = f.isSequence ? `${f.steps.length} steps, ${f.participants.length} layers${f.sections.length ? ', ' + f.sections.length + ' chapters' : ''}` : f.diagramType;
    Notes.load(f);
    Glossary.load(f);
    if (S.cur >= Walk.count()) S.cur = Walk.count() - 1;
    if (!f.isSequence) S.cur = -1;
    Follow.compute();
    if (Find.q) Find.run(el.findInput.value);
    if (Spot.alias && !f.layers[Spot.alias]) Spot.alias = null;
    Path.renderSelect();
    Hl.apply(S.cur);
    Hl.decorate();
    Walk.render(null);
    Chapters.render();
    Progress.render();
    Follow.renderStrip();
    Table.render();
    Editor.renderLint();
    Editor.setError(null);
    this.updateCodeCount();
    Notes.ui();
    BehindPop.ui();
    Insight.render();
    Presenter.render();
    if (!f.isSequence) {
      Shell.notice(`This is a <b>${esc(f.diagramType)}</b> diagram. The walkthrough, pinned header and table work with sequence diagrams, so only pan and zoom are on.`);
      if (S.view === 'table') Shell.setView('diagram');
    } else if (!Spot.alias && Path.mode === 'all') Shell.notice(null);
    if (first && f.isSequence && this.hashStep > 0) Walk.go(this.hashStep - 1);
  },
  updateCodeCount() {
    const c = el.codeCount;
    if (S.error) { c.hidden = false; c.className = 'count err'; c.textContent = 'error'; return; }
    const n = (S.flow?.lint || []).filter((l) => l.code === 'no-step').length;
    c.hidden = !n;
    c.className = 'count';
    c.textContent = `${n} unexplained`;
  },
  setTheme(theme, render = true) {
    S.settings.theme = theme;
    saveSettings();
    el.themeSel.value = theme;
    el.themeSel2.value = theme;
    if (Renderer.mermaidReady) { Renderer.configure(); if (render) Renderer.render(el.code.value); }
  },
  setWheel(mode) {
    S.settings.wheel = mode;
    saveSettings();
    const label = mode === 'zoom' ? 'Wheel: Zoom' : 'Wheel: Scroll';
    el.wheelBtn.textContent = label;
    el.wheelBtn.setAttribute('aria-pressed', mode === 'zoom');
    el.wheelBtn.title = mode === 'zoom' ? 'The wheel zooms like mermaid.live. Click to scroll instead.' : 'The wheel scrolls; Ctrl + wheel zooms. Click to zoom with the wheel.';
    const mw = el.moreMenu.querySelector('[data-more="wheel"]');
    if (mw) mw.textContent = label;
  },
  setDim(on) {
    S.settings.dim = on;
    saveSettings();
    el.dimBtn.setAttribute('aria-pressed', on);
    Hl.apply(S.cur);
  },
  setBands(on) {
    S.settings.bands = on;
    saveSettings();
    el.bandBtn.setAttribute('aria-pressed', on);
    Hl.apply(S.cur);
  },
  setGrid(on) {
    S.settings.grid = on;
    saveSettings();
    el.canvas.classList.toggle('grid', on);
    el.gridBtn.setAttribute('aria-pressed', on);
    Camera.apply();
  },
  fixPrompt() {
    const f = S.flow;
    if (!f?.isSequence) { Shell.toast('The fix-prompt works with sequence diagrams'); return; }
    const missing = f.steps.filter((s) => !s.explain);
    const other = f.lint.filter((l) => l.code !== 'no-step');
    const text = `Use the sequence-walkthrough skill in update mode on this Mermaid sequence diagram ("${f.title}", format ${VERSION.spec}).
Keep every arrow, label and the arrow order exactly as they are. Only add or fix annotations.

${missing.length ? `Add a %% @step line (what happens and why, 1-2 sentences) directly above these arrows:\n${missing.map((s) => `- Step ${s.n}, line ${s.line + 1}: ${route(s)}: ${s.label.join(' / ')}`).join('\n')}\n` : 'Every arrow already has a @step.\n'}${other.length ? `\nAlso fix these notes from the viewer:\n${other.map((l) => `- Line ${l.line + 1}: ${l.msg}`).join('\n')}\n` : ''}
Check it by piping it into validate.py on stdin (don't create a file), then return the full updated code in one \`\`\`mermaid block.

\`\`\`mermaid
${el.code.value}
\`\`\``;
    Files.copy(text, `Copied a fix-prompt for ${missing.length} unexplained step${missing.length === 1 ? '' : 's'}`);
  },
  async init() {
    // Settings into the UI
    el.themeSel2.innerHTML = el.themeSel.innerHTML;
    el.themeSel.value = S.settings.theme;
    el.themeSel2.value = S.settings.theme;
    this.setWheel(S.settings.wheel);
    el.dimBtn.setAttribute('aria-pressed', !!S.settings.dim);
    el.bandBtn.setAttribute('aria-pressed', S.settings.bands !== false);
    el.canvas.classList.toggle('grid', S.settings.grid !== false);
    el.gridBtn.setAttribute('aria-pressed', S.settings.grid !== false);
    el.speedSel.value = String(S.settings.speed);
    if (!el.speedSel.value) { el.speedSel.value = '3000'; S.settings.speed = 3000; }
    for (const part of ['top', 'bar']) if (S.settings.fold?.[part]) Shell.setFold(part, true);
    Editor.init();
    BarSize.init();
    bindUI();
    // Initial code: link fragment, then autosave, then the example flow.
    // The fragment may hold `z.<code>`, `pako:<mermaid.live state>` and `step=N`, joined with `&`.
    let code = Store.get('swv:code', null);
    let fromHash = false;
    const parts = location.hash.replace(/^#/, '').split('&');
    const stepPart = parts.find((p) => /^step[=-]\d+$/.test(p));
    this.hashStep = stepPart ? parseInt(stepPart.slice(5), 10) : 0;
    const z = parts.find((p) => p.startsWith('z.'));
    const live = parts.find((p) => /^(pako|base64):/.test(p));
    try {
      if (z) { code = await Codec.inflate(Codec.unb64(z.slice(2))); fromHash = true; }
      else if (live) { code = (await Codec.fromLive('https://mermaid.live/edit#' + live)).code; fromHash = true; }
    } catch { Shell.toast('The code in this link could not be read, so the saved code is shown'); }
    if (!code || !code.trim()) code = SAMPLE;
    Editor.setCode(code, { render: false });
    if (!Store.ok) Shell.toast('Storage is blocked here, so code, notes and bookmarks last only for this session.');
    // Mermaid + fonts
    try {
      await Promise.all([loadScript(MERMAID_URLS, () => window.mermaid && window.mermaid.render), Fonts.init()]);
    } catch (err) {
      el.loading.textContent = 'Mermaid could not be loaded. Check the connection and reload the page.';
      return;
    }
    Renderer.mermaidReady = true;
    Renderer.configure();
    await Renderer.render(el.code.value, { fit: true });
    if (fromHash) Shell.toast('Loaded the diagram from the link');
    App.debug.ready = true;
  },
};

/* ===================== Input wiring ===================== */
function bindUI() {
  const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
  // Top bar
  on('viewDiagram', 'click', () => Shell.setView('diagram'));
  on('viewTable', 'click', () => Shell.setView('table'));
  on('findBtn', 'click', () => Find.open());
  on('zoomIn', 'click', () => Camera.zoomCenter(1.25));
  on('zoomOut', 'click', () => Camera.zoomCenter(0.8));
  on('zoomPct', 'click', () => Camera.zoomTo(1));
  on('fitBtn', 'click', () => Camera.fitWidth());
  on('wheelBtn', 'click', () => App.setWheel(S.settings.wheel === 'zoom' ? 'scroll' : 'zoom'));
  on('themeSel', 'change', (e) => App.setTheme(e.target.value));
  on('themeSel2', 'change', (e) => App.setTheme(e.target.value));
  on('helpBtn', 'click', () => Modal.help());
  on('guideBtn', 'click', () => Modal.guide());
  on('exportBtn', 'click', () => Shell.openMenu(el.exportBtn, el.exportMenu));
  on('moreBtn', 'click', () => Shell.openMenu(el.moreBtn, el.moreMenu));
  el.exportMenu.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    Shell.closeMenus();
    const act = b.dataset.act;
    const notes = document.getElementById('tvNotes').checked;
    try {
      if (act === 'pdf') Modal.pdf();
      else if (act === 'png1') await Exporter.png(1);
      else if (act === 'png2') await Exporter.png(2);
      else if (act === 'png4') await Exporter.png(4);
      else if (act === 'svg') await Exporter.svg();
      else if (act === 'stepimg') await Exporter.stepImage();
      else if (act === 'mmd') await Exporter.mmd();
      else if (act === 'csv') await Exporter.csv(notes);
      else if (act === 'md') await Exporter.markdown(notes);
      else if (act === 'live-open') await Exporter.liveOpen();
      else if (act === 'live-copy') await Exporter.liveCopy();
      else if (act === 'share') await Exporter.share();
      else if (act === 'share-step') await Exporter.share(true);
      else if (act === 'ai') Ask.settingsModal();
      else if (act === 'skill') await Exporter.skillKit();
      else if (act === 'import') Modal.importer();
      else if (act === 'open-file') document.getElementById('fileInput').click();
    } catch (err) { Shell.toast('Export failed: ' + (err.message || err)); }
  });
  el.moreMenu.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-more]');
    if (!b) return;
    const a = b.dataset.more;
    Shell.closeMenus();
    if (a === 'guide') Modal.guide();
    else if (a === 'insight') Insight.toggle();
    else if (a === 'ai') Ask.settingsModal();
    else if (a === 'view') Shell.setView(S.view === 'table' ? 'diagram' : 'table');
    else if (a === 'find') Find.open();
    else if (a === 'fit') Camera.fitWidth();
    else if (a === 'fitall') Camera.fitAll();
    else if (a === 'wheel') App.setWheel(S.settings.wheel === 'zoom' ? 'scroll' : 'zoom');
    else if (a === 'export') { el.exportMenu.hidden = false; el.exportMenu.style.position = 'fixed'; el.exportMenu.style.top = '56px'; el.exportMenu.style.right = '16px'; el.exportBtn.closest('.menu-wrap').classList.remove('tb-extra'); el.exportBtn.hidden = true; el.exportMenu.querySelector('button')?.focus(); }
    else if (a === 'help') Modal.help();
  });
  // Find
  el.findInput.addEventListener('input', () => { Find.run(el.findInput.value); if (Find.hits.length && !Find.hits.includes(S.cur)) Find.next(); });
  el.findInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.shiftKey ? Find.prev() : Find.next(); ev.preventDefault(); }
    else if (ev.key === 'Escape') { Find.close(); ev.preventDefault(); }
    ev.stopPropagation();
  });
  on('findNext', 'click', () => Find.next());
  on('findPrev', 'click', () => Find.prev());
  on('findClose', 'click', () => Find.close());
  // Canvas controls
  on('codeBtn', 'click', () => Shell.setCode(!S.codeOpen));
  on('codeClose', 'click', () => Shell.setCode(false));
  on('edgeLeft', 'click', () => Shell.setCode(!S.codeOpen));
  on('edgeTop', 'click', () => Shell.setFold('top', !el.topbar.hidden));
  on('edgeBottom', 'click', () => Shell.setFold('bar', !el.wbar.hidden));
  on('playBtn', 'click', () => Play.toggle());
  on('speedSel', 'change', (e) => { S.settings.speed = +e.target.value; saveSettings(); if (S.playing) Play.schedule(); });
  on('dimBtn', 'click', () => App.setDim(!S.settings.dim));
  on('bandBtn', 'click', () => App.setBands(!S.settings.bands));
  on('insightBtn', 'click', () => Insight.toggle());
  on('insightClose', 'click', () => Insight.toggle(false));
  el.insightPanel.addEventListener('click', (ev) => Insight.click(ev));
  el.insightPanel.addEventListener('submit', (ev) => Insight.submit(ev));
  on('behindBtn', 'click', () => (BehindPop.node ? BehindPop.close() : BehindPop.open()));
  on('pathSel', 'change', (e) => Path.set(e.target.value));
  el.progress.addEventListener('click', (ev) => { const b = ev.target.closest('[data-sec]'); if (b) Chapters.jump(+b.dataset.sec); });
  el.presentCard.addEventListener('click', (ev) => { if (ev.target.closest('[data-leave]')) Presenter.toggle(false); });
  on('hideBtn', 'click', () => Shell.setHide(true));
  on('showCtrls', 'click', () => Shell.setHide(false));
  on('gridBtn', 'click', () => App.setGrid(!S.settings.grid));
  on('sampleBtn', 'click', () => { Editor.setCode(SAMPLE, { fit: true }); Shell.toast('Loaded the example flow'); });
  on('fixPromptBtn', 'click', () => App.fixPrompt());
  on('copyCodeBtn', 'click', () => Files.copy(el.code.value, 'Copied the code'));
  // Table
  on('tvMd', 'click', () => Exporter.markdown(document.getElementById('tvNotes').checked));
  on('tvCsv', 'click', () => Exporter.csv(document.getElementById('tvNotes').checked));
  on('tvClose', 'click', () => Shell.setView('diagram'));
  el.tvBody.addEventListener('click', (ev) => { const tr = ev.target.closest('tr[data-step]'); if (tr) Walk.go(+tr.dataset.step, { camera: false }); });
  el.tvBody.addEventListener('dblclick', (ev) => { const tr = ev.target.closest('tr[data-step]'); if (tr) { Shell.setView('diagram'); Walk.go(+tr.dataset.step); } });
  // Walkthrough bar
  on('prevBtn', 'click', () => Walk.prev());
  on('nextBtn', 'click', () => Walk.next());
  for (const c of [el.cardPrev, el.cardNext]) {
    c.addEventListener('click', () => { if (c.dataset.step != null && !c.classList.contains('empty')) Walk.go(+c.dataset.step); });
    c.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && !c.classList.contains('empty')) { ev.preventDefault(); Walk.go(+c.dataset.step); } });
  }
  el.chapters.addEventListener('click', (ev) => {
    if (ev.target.closest('#lockBtn')) { Chapters.toggleLock(); return; }
    const b = ev.target.closest('[data-sec]');
    if (b) Chapters.jump(+b.dataset.sec);
  });
  el.followStrip.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.go) Walk.go(+b.dataset.go);
    else if (b.dataset.fol === 'next') Follow.next();
    else if (b.dataset.fol === 'prev') Follow.prev();
    else if (b.dataset.fol === 'ask') Ask.term(Follow.display);
    else if (b.dataset.fol === 'clear') Follow.clear();
  });
  // The centre card: step links, reply chips, layer pills, glossary terms, Follow tokens and the Ask panel.
  el.cardCur.addEventListener('click', (ev) => {
    if (Ask.click(ev)) return;
    const go = ev.target.closest('[data-go]');
    if (go) { Walk.go(+go.dataset.go); return; }
    const spot = ev.target.closest('[data-spot]');
    if (spot) { Spot.toggle(spot.dataset.spot); return; }
    const open = ev.target.closest('[data-open]');
    if (open) { Insight.show(open.dataset.open); return; }
    const term = ev.target.closest('.term');
    if (term) { TermPop.open(term.dataset.term, ev.clientX, ev.clientY); return; }
    const t = ev.target.closest('.tok');
    if (t) Follow.start(t.dataset.tok);
  });
  el.cardCur.addEventListener('submit', (ev) => Ask.submit(ev));
  // The wheel over the step bar moves to the previous or next step. The centre card scrolls its own
  // content first when it overflows; inputs and the chapter row's sideways scroll are left alone.
  let wheelAcc = 0, wheelLast = 0, wheelTimer = 0;
  el.wbar.addEventListener('wheel', (ev) => {
    const t = ev.target;
    if (t.closest('textarea, input, select')) return;
    const vertical = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX);
    const d = vertical ? ev.deltaY : ev.deltaX;
    const card = t.closest('#cardCur');
    if (card && vertical) {
      const canDown = card.scrollTop + card.clientHeight < card.scrollHeight - 1, canUp = card.scrollTop > 0;
      if ((d > 0 && canDown) || (d < 0 && canUp)) return;
    }
    if (!vertical && t.closest('.chapters')) return;
    ev.preventDefault();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelAcc = 0; }, 250);
    wheelAcc += d;
    const now = performance.now();
    if (Math.abs(wheelAcc) < 40 || now - wheelLast < 160) return;
    wheelLast = now;
    const dir = wheelAcc > 0 ? 1 : -1;
    wheelAcc = 0;
    if (dir > 0) Walk.next(); else Walk.prev();
  }, { passive: false });
  el.bmBtn.addEventListener('click', () => (BmPop.node ? BmPop.close() : BmPop.open()));
  document.addEventListener('click', (ev) => {
    if (BmPop.node && BmPop.node.contains(ev.target)) { BmPop.click(ev); return; }
    if (BmPop.node && !el.bmBtn.contains(ev.target)) BmPop.close();
    if (BehindPop.node && BehindPop.node.contains(ev.target)) { BehindPop.click(ev); return; }
    if (BehindPop.node && !el.behindBtn.contains(ev.target)) BehindPop.close();
    if (TermPop.node && TermPop.node.contains(ev.target)) { TermPop.click(ev); return; }
    if (TermPop.node && !ev.target.closest('.term')) TermPop.close();
    if (Ctx.node && !Ctx.node.contains(ev.target)) Ctx.close();
    if (!ev.target.closest('.menu-wrap') && (!el.exportMenu.hidden || !el.moreMenu.hidden)) Shell.closeMenus();
    if (ev.target.closest('[data-act="spot-clear"]')) Spot.clear();
    if (ev.target.closest('[data-act="path-clear"]')) Path.set('all');
    const term = !el.cardCur.contains(ev.target) && ev.target.closest('.term');
    if (term) TermPop.open(term.dataset.term, ev.clientX, ev.clientY);
  });
  // Files
  document.getElementById('fileInput').addEventListener('change', (ev) => { Importer.fromFile(ev.target.files[0]); ev.target.value = ''; });
  document.getElementById('notesInput').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try { const n = Notes.importObj(JSON.parse(await f.text())); Shell.toast(`Imported ${n} note${n === 1 ? '' : 's'}`); BmPop.render(); }
    catch (err) { Shell.toast('Could not import notes: ' + (err.message || err)); }
  });
  let dragDepth = 0;
  let dropOv = null;
  const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (ev) => {
    if (!hasFiles(ev)) return;
    dragDepth++;
    if (!dropOv) { dropOv = document.createElement('div'); dropOv.className = 'drop-ov'; dropOv.innerHTML = '<div>Drop a .mmd, .md or .txt file</div>'; document.body.appendChild(dropOv); }
  });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropOv?.remove(); dropOv = null; } });
  window.addEventListener('dragover', (ev) => { if (hasFiles(ev)) ev.preventDefault(); });
  window.addEventListener('drop', (ev) => {
    if (!hasFiles(ev)) return;
    ev.preventDefault();
    dragDepth = 0; dropOv?.remove(); dropOv = null;
    Importer.fromFile(ev.dataTransfer.files[0]);
  });
  // Paste outside the editor: links and code load straight away
  document.addEventListener('paste', (ev) => {
    const t = ev.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
    const text = ev.clipboardData?.getData('text') || '';
    if (Importer.isLiveLink(text) || Importer.looksLikeMermaid(text)) { ev.preventDefault(); Importer.fromText(text); }
  });
  // Right-click a selected word to follow it
  document.addEventListener('contextmenu', (ev) => {
    const sel = String(window.getSelection?.() || '').trim();
    if (!sel || ev.target.closest('textarea, input')) return;
    const tk = tokens(sel);
    if (tk.length !== 1 || !isFollowable(tk[0])) return;
    ev.preventDefault();
    Ctx.open(ev.clientX, ev.clientY, tk[0]);
  });
  bindCanvas();
  bindKeys();
  window.addEventListener('resize', debounce(() => { Camera.clampPos(); Camera.apply(); }, 100));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && S.hide && S.enteredFs) { S.enteredFs = false; Shell.setHide(false); } });
}

function bindCanvas() {
  const c = el.canvas;
  const pts = new Map();
  let drag = null, pinch = null;
  const local = (ev) => { const r = c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  c.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.cv-controls, .canvas-msg, .tooltip')) return;
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    try { c.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
    pts.set(ev.pointerId, local(ev));
    if (pts.size === 1) drag = { start: local(ev), cam: { x: Camera.x, y: Camera.y }, moved: false, target: ev.target };
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: Camera.k, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: { x: Camera.x, y: Camera.y } };
      drag = null;
    }
  });
  c.addEventListener('pointermove', (ev) => {
    if (!pts.has(ev.pointerId)) {
      if (ev.pointerType !== 'mouse') { Tip.hide(); return; }
      const a = ev.target.closest?.('.swv-actor');
      const h = !a && ev.target.closest?.('[data-step]');
      if (a) Tip.show(a.getAttribute('data-alias'), ev.clientX, ev.clientY);
      else if (h && S.flow?.isSequence) Tip.step(+h.getAttribute('data-step'), ev.clientX, ev.clientY);
      else Tip.hide();
      return;
    }
    pts.set(ev.pointerId, local(ev));
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k2 = clamp(pinch.k * d / pinch.d, 0.1, 8);
      const r = k2 / pinch.k;
      Camera.set(mid.x - (pinch.mid.x - pinch.cam.x) * r, mid.y - (pinch.mid.y - pinch.cam.y) * r, k2);
      return;
    }
    if (!drag) return;
    const p = local(ev);
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    c.classList.add('dragging');
    Camera.set(drag.cam.x + dx, drag.cam.y + dy);
  });
  const end = (ev) => {
    if (!pts.has(ev.pointerId)) return;
    pts.delete(ev.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag && !drag.moved && ev.type === 'pointerup') clickAt(drag.target);
    if (!pts.size) { drag = null; c.classList.remove('dragging'); }
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('pointerleave', () => Tip.hide());
  c.addEventListener('pointerdown', () => Tip.hide());
  c.addEventListener('wheel', (ev) => {
    if (ev.target.closest('.cv-controls')) return;
    ev.preventDefault();
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? c.clientHeight : 1;
    const dx = ev.deltaX * unit, dy = ev.deltaY * unit;
    const p = local(ev);
    if (ev.ctrlKey || ev.metaKey) Camera.zoomAt(p.x, p.y, Math.exp(-dy * 0.01));
    else if (S.settings.wheel === 'zoom') Camera.zoomAt(p.x, p.y, Math.exp(-dy * 0.0025));
    else if (ev.shiftKey && !dx) Camera.panBy(-dy, 0);
    else Camera.panBy(-dx, -dy);
  }, { passive: false });
  c.addEventListener('dblclick', (ev) => {
    // Pointer capture retargets dblclick to the canvas, so look up what is under the pointer.
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const hit = under && under.closest('[data-step]');
    if (!hit) return;
    const d = S.dom[+hit.getAttribute('data-step')];
    if (!d) return;
    for (const t of d.texts) {
      const m = t.getScreenCTM();
      if (!m) continue;
      const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
      let ci = -1;
      try { ci = t.getCharNumAtPosition(pt); } catch { ci = -1; }
      if (ci < 0) continue;
      const txt = t.textContent;
      for (const mm of txt.matchAll(TOKEN_RE)) {
        if (ci >= mm.index && ci < mm.index + mm[0].length) { window.getSelection()?.removeAllRanges(); Follow.start(mm[0]); return; }
      }
    }
  });
}
function clickAt(target) {
  const step = target.closest?.('[data-step]');
  if (step && S.flow?.isSequence) { Walk.go(+step.getAttribute('data-step')); return; }
  const actor = target.closest?.('.swv-actor');
  if (actor) Spot.toggle(actor.getAttribute('data-alias'));
}

function bindKeys() {
  document.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented) return;
    const t = ev.target;
    const typing = t.closest && t.closest('input, textarea, select, [contenteditable]');
    if (ev.key === 'Escape') {
      if (t === el.code) { Shell.escape(); ev.preventDefault(); return; }
      if (typing && t.tagName === 'SELECT') return;
      Shell.escape();
      ev.preventDefault();
      return;
    }
    if (Modal.node) return;
    if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key;
    const diagram = S.view === 'diagram';
    const map = {
      ArrowRight: () => Walk.next(), ArrowLeft: () => Walk.prev(), Home: () => Walk.go(0), End: () => Walk.go(Walk.count() - 1),
      '[': () => Chapters.prev(), ']': () => Chapters.next(), ' ': () => Play.toggle(),
      ArrowUp: () => diagram && Camera.panBy(0, 80), ArrowDown: () => diagram && Camera.panBy(0, -80),
      '+': () => Camera.zoomCenter(1.25), '=': () => Camera.zoomCenter(1.25), '-': () => Camera.zoomCenter(0.8), _: () => Camera.zoomCenter(0.8),
      0: () => Camera.fitWidth(), f: () => Camera.fitAll(), F: () => Camera.fitAll(),
      t: () => Shell.setView(S.view === 'table' ? 'diagram' : 'table'), T: () => Shell.setView(S.view === 'table' ? 'diagram' : 'table'),
      h: () => Shell.setHide(!S.hide), H: () => Shell.setHide(!S.hide),
      c: () => Shell.setCode(!S.codeOpen), C: () => Shell.setCode(!S.codeOpen),
      b: () => Notes.toggleStar(), B: () => Notes.toggleStar(), n: () => Walk.toggleNote(), N: () => Walk.toggleNote(),
      a: () => Ask.toggle(), A: () => Ask.toggle(), i: () => Insight.toggle(), I: () => Insight.toggle(),
      k: () => Chapters.toggleLock(), K: () => Chapters.toggleLock(), p: () => Presenter.toggle(), P: () => Presenter.toggle(),
      '/': () => Find.open(), '?': () => Modal.help(),
    };
    const fn = map[k];
    if (!fn) return;
    if (t.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) return;
    if (t.closest && t.closest('.tv-scroll') && (k === 'ArrowUp' || k === 'ArrowDown')) return;
    ev.preventDefault();
    fn();
  });
}

window.SWV = { S, App, Walk, Camera, Notes, Follow, Find, Spot, Table, Exporter, Codec, Importer, Editor, Renderer, Shell, Chapters, Header, Play, Annotations, buildFlow, mermaidLineToCode, Path, Progress, Presenter, Insight, Glossary, Ask, BehindPop };
App.init();

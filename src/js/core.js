'use strict';
/* ===================== Constants and helpers ===================== */
const VERSION = { app: '1.0', mermaid: '12.2.0', jspdf: '4.2.1', spec: 'walkthrough/1' };
const MERMAID_URLS = [
  'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.min.js',
  'https://unpkg.com/mermaid@12.2.0/dist/mermaid.min.js',
];
const JSPDF_URLS = [
  'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js',
];
const DEFAULT_TITLE = 'Sequence diagram';
const SVGNS = 'http://www.w3.org/2000/svg';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isNarrow = () => window.matchMedia('(max-width: 720px)').matches;

function loadScript(urls, globalCheck) {
  return new Promise((resolve, reject) => {
    if (globalCheck()) return resolve();
    let i = 0;
    const next = () => {
      if (i >= urls.length) return reject(new Error('Could not load ' + urls[0]));
      const s = document.createElement('script');
      s.src = urls[i++];
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => (globalCheck() ? resolve() : next());
      s.onerror = () => { s.remove(); next(); };
      document.head.appendChild(s);
    };
    next();
  });
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Mermaid writes entities as #59; or #quot; inside labels. */
function decodeEntities(s) {
  return String(s ?? '')
    .replace(/#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/#([a-zA-Z]+);/g, (m, n) => {
      const t = document.createElement('textarea');
      t.innerHTML = '&' + n + ';';
      return t.value === '&' + n + ';' ? m : t.value;
    })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
const splitLabel = (raw) => decodeEntities(raw).split(/<br\s*\/?>/i).map((s) => s.trim());

/* ===================== Store (localStorage with memory fallback) ===================== */
const Store = (() => {
  let ok = true;
  const mem = {};
  try { const k = '__swv_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); } catch { ok = false; }
  return {
    get ok() { return ok; },
    get(k, d) {
      try {
        const v = ok ? localStorage.getItem(k) : mem[k];
        return v == null ? d : JSON.parse(v);
      } catch { return d; }
    },
    set(k, v) {
      const s = JSON.stringify(v);
      mem[k] = s;
      if (!ok) return false;
      try { localStorage.setItem(k, s); return true; } catch { ok = false; return false; }
    },
    del(k) { delete mem[k]; try { if (ok) localStorage.removeItem(k); } catch { /* blocked */ } },
    keys(prefix) {
      const out = new Set(Object.keys(mem).filter((k) => k.startsWith(prefix)));
      try { if (ok) for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) out.add(k); } } catch { /* blocked */ }
      return [...out];
    },
  };
})();

/* ===================== Annotations (walkthrough/1) ===================== */
const KNOWN_TAGS = ['spec', 'title', 'layer', 'section', 'step', 'payload', 'ref'];
const SEQ_KEYWORD = /^(participant|actor|note|loop|alt|else|opt|par_over|par|and|critical|option|break|rect|end|activate|deactivate|autonumber|box|create|destroy|title|acctitle|accdescr|links?|properties|details|sequencediagram)\b/i;
const STOPWORDS = new Set('the and with for from that this then than are was were has have had not but you your our its into onto out over under via per any all can will may each also just only more most such what when where which while who why how yes use uses used get got set put new old one two too off own same other again key'.split(' '));

const Annotations = {
  /** Splits the code into lines and finds annotations, arrow lines and the diagram type. */
  parse(code) {
    const lines = code.replace(/\r\n?/g, '\n').split('\n');
    const res = {
      lines, title: '', titleLine: -1, fmTitle: '', kwTitle: '', spec: '', layers: {}, arrows: [],
      lint: [], diagramType: '', typeLine: -1, sectionCount: 0, frontMatterEnd: -1,
    };
    let i = 0;
    // Front matter (--- ... ---) at the very top.
    while (i < lines.length && !lines[i].trim()) i++;
    if (lines[i] && lines[i].trim() === '---') {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '---') { res.frontMatterEnd = j; break; }
        const m = lines[j].match(/^title:\s*(.+)$/);
        if (m) res.fmTitle = m[1].trim().replace(/^["']|["']$/g, '');
      }
      if (res.frontMatterEnd >= 0) i = res.frontMatterEnd + 1;
    }
    let pending = null;
    const newPending = () => ({ step: [], stepLine: -1, payload: [], refs: [], section: null, sectionLine: -1, firstLine: -1, lines: [] });
    pending = newPending();
    let inAccBlock = false;
    let lastSection = null; // { name, line, used }
    const warn = (line, msg, code) => res.lint.push({ line, msg, code });

    for (; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();
      if (!t) continue;
      if (inAccBlock) { if (t.includes('}')) inAccBlock = false; continue; }
      const am = t.match(/^%%\s*@([A-Za-z]+)\b[ \t]?(.*)$/);
      if (am) {
        const tag = am[1].toLowerCase();
        const val = am[2].trim();
        if (!res.diagramType) { /* annotations before the header are allowed but unusual */ }
        if (pending.firstLine < 0) pending.firstLine = i;
        switch (tag) {
          case 'spec': res.spec = val; break;
          case 'title': res.title = val; res.titleLine = i; break;
          case 'layer': {
            const m = val.match(/^(\S+)\s*(.*)$/);
            if (m) res.layers[m[1]] = { text: m[2].trim(), line: i };
            else warn(i, '@layer needs an alias and a description', 'layer-empty');
            break;
          }
          case 'section':
            if (lastSection && !lastSection.used) warn(lastSection.line, `Chapter "${lastSection.name || '(no name)'}" has no steps`, 'empty-section');
            if (!val) warn(i, '@section needs a name', 'empty-section');
            lastSection = { name: val, line: i, used: false };
            pending.section = val || 'Untitled';
            pending.sectionLine = i;
            pending.lines.push(i);
            res.sectionCount++;
            break;
          case 'step': if (pending.stepLine < 0) pending.stepLine = i; pending.step.push(val); pending.lines.push(i); break;
          case 'payload': pending.payload.push(val); pending.lines.push(i); break;
          case 'ref': if (val) pending.refs.push(val); pending.lines.push(i); break;
          default: warn(i, `Unknown tag @${am[1]} (known: ${KNOWN_TAGS.map((x) => '@' + x).join(', ')})`, 'unknown-tag');
        }
        continue;
      }
      if (t.startsWith('%%')) continue; // ordinary comment or %%{ config }%%
      if (!res.diagramType) {
        res.diagramType = t.split(/[\s:;{]/)[0];
        res.typeLine = i;
        continue;
      }
      if (!/^sequenceDiagram$/i.test(res.diagramType)) continue;
      if (/^acc(Descr|Title)\s*\{/i.test(t) && !t.includes('}')) { inAccBlock = true; continue; }
      if (SEQ_KEYWORD.test(t)) {
        const tm = t.match(/^title\s*:?\s*(.+)$/i);
        if (tm) res.kwTitle = tm[1].trim();
        continue;
      }
      if (!t.includes('-')) continue; // every Mermaid arrow contains a dash
      const colon = t.indexOf(':');
      const arrow = {
        line: i,
        left: colon >= 0 ? t.slice(0, colon).trim() : t,
        text: colon >= 0 ? t.slice(colon + 1).trim() : '',
        step: pending.step.join(' ').trim(),
        stepLine: pending.stepLine,
        payload: pending.payload.join('\n').trim(),
        refs: pending.refs.slice(),
        section: pending.section,
        sectionLine: pending.sectionLine,
        annLines: pending.lines.slice(),
      };
      if (pending.section != null && lastSection) lastSection.used = true;
      res.arrows.push(arrow);
      pending = newPending();
    }
    if (pending.step.length || pending.payload.length || pending.refs.length) {
      warn(pending.lines[0] ?? lines.length - 1, 'Annotation has no arrow after it', 'orphan');
    }
    if (lastSection && !lastSection.used) warn(lastSection.line, `Chapter "${lastSection.name || '(no name)'}" has no steps`, 'empty-section');
    return res;
  },
};

/** Fallback when Mermaid's parser API is not reachable: read from, to and arrow style from the line text. */
const ARROW_STRONG = /(<<-->>|<<->>|-->>|->>|-->|->)\s*[+-]?/;
const ARROW_WEAK = /(--x|-x|--\)|-\)|--?[|\\/]{1,2}|[|\\/]{1,2}--?)\s*[+-]?/;
function findArrow(left) { return left.match(ARROW_STRONG) || left.match(ARROW_WEAK); }
function parseArrowLeft(left) {
  const m = findArrow(left);
  if (!m) return null;
  const from = left.slice(0, m.index).trim(), to = left.slice(m.index + m[0].length).trim();
  return from && to ? { from, to, dotted: m[1].includes('--') } : null;
}

/* ===================== Flow model ===================== */
const DOTTED_TYPES = new Set([1, 4, 6, 25, 34, 51, 52, 53, 54, 55, 56, 57, 58]);
const BLOCK_START = { 10: 'loop', 12: 'alt', 15: 'opt', 19: 'par', 32: 'par', 22: 'rect', 27: 'critical', 30: 'break' };
const BLOCK_MID = { 13: 'else', 20: 'and', 28: 'option' };
const BLOCK_END = new Set([11, 14, 16, 21, 23, 29, 31]);
const NON_ARROW = new Set([2, 17, 18, 26]);

/** Mermaid's own view of the diagram: participants, arrows (in drawing order) and block nesting. */
function mermaidInfo(diagram) {
  const db = diagram.db;
  const actors = db.getActors ? db.getActors() : {};
  const isMap = actors instanceof Map;
  const get = (k) => (isMap ? actors.get(k) : actors[k]);
  const keys = db.getActorKeys ? db.getActorKeys() : isMap ? [...actors.keys()] : Object.keys(actors);
  const participants = keys.map((k) => { const a = get(k); return { alias: k, name: decodeEntities((a && (a.description || a.name)) || k), type: a?.type || 'participant' }; });
  const stack = [];
  const arrows = [];
  for (const m of db.getMessages()) {
    const t = m.type;
    if (BLOCK_START[t] !== undefined) { stack.push({ kind: BLOCK_START[t], label: decodeEntities(typeof m.message === 'string' ? m.message : '') }); continue; }
    if (BLOCK_MID[t] !== undefined) { if (stack.length) stack[stack.length - 1] = { kind: BLOCK_MID[t], label: decodeEntities(typeof m.message === 'string' ? m.message : '') }; continue; }
    if (BLOCK_END.has(t)) { stack.pop(); continue; }
    if (NON_ARROW.has(t) || !m.from || !m.to) continue;
    arrows.push({ from: m.from, to: m.to, text: typeof m.message === 'string' ? m.message : '', type: t, dotted: DOTTED_TYPES.has(t), branch: stack.filter((b) => b.kind !== 'rect').map((b) => ({ ...b })) });
  }
  return { participants, arrows, type: diagram.type };
}

const normLabel = (s) => decodeEntities(s).replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Joins the annotation parse with Mermaid's arrows into the Flow the UI uses. */
function buildFlow(ann, info) {
  const isSequence = /^sequenceDiagram$/i.test(ann.diagramType) && (!info || info.type === 'sequence');
  const title = ann.title || ann.fmTitle || ann.kwTitle || DEFAULT_TITLE;
  const flow = {
    title, hasTitle: !!ann.title, spec: ann.spec, isSequence, diagramType: ann.diagramType || 'unknown',
    layers: {}, participants: [], sections: [], steps: [], lint: ann.lint.slice(), mismatch: false,
  };
  if (!isSequence) return flow;

  // Participants: Mermaid is the source of truth; fall back to aliases seen in arrows.
  let parts = info ? info.participants : [];
  if (!parts.length) {
    const seen = new Map();
    for (const a of ann.arrows) { const p = parseArrowLeft(a.left); if (p) { seen.set(p.from, p.from); seen.set(p.to, p.to); } }
    parts = [...seen.keys()].map((k) => ({ alias: k, name: k, type: 'participant' }));
  }
  flow.participants = parts;
  for (const p of parts) flow.layers[p.alias] = { name: p.name, desc: ann.layers[p.alias]?.text || '' };
  for (const [alias, l] of Object.entries(ann.layers)) {
    if (!flow.layers[alias]) flow.lint.push({ line: l.line, msg: `@layer ${alias}: no participant has this alias`, code: 'unknown-alias' });
  }

  // Arrows: pair Mermaid's arrows with the annotated lines.
  const mArrows = info ? info.arrows : ann.arrows.map((a) => { const p = parseArrowLeft(a.left) || { from: '?', to: '?', dotted: false }; return { from: p.from, to: p.to, text: a.text, dotted: p.dotted, branch: [] }; });
  let pairs;
  if (mArrows.length === ann.arrows.length) {
    pairs = mArrows.map((m, i) => [m, ann.arrows[i]]);
  } else {
    flow.mismatch = true;
    pairs = [];
    let p = 0;
    for (const m of mArrows) {
      const want = normLabel(m.text);
      let hit = null;
      for (let j = p; j < ann.arrows.length; j++) {
        if (normLabel(ann.arrows[j].text) === want) { hit = ann.arrows[j]; p = j + 1; break; }
      }
      pairs.push([m, hit]);
    }
  }

  const keyCount = {};
  let sectionIdx = -1;
  pairs.forEach(([m, a], idx) => {
    if (a && a.section != null) {
      flow.sections.push({ name: a.section, firstStep: idx, count: 0, line: a.sectionLine });
      sectionIdx = flow.sections.length - 1;
    }
    const label = splitLabel(m.text);
    const baseKey = `${m.from}→${m.to}|${label.join(' / ')}`;
    keyCount[baseKey] = (keyCount[baseKey] || 0) + 1;
    const step = {
      idx, n: idx + 1, line: a ? a.line : -1, annLines: a ? a.annLines : [],
      from: m.from, to: m.to,
      fromName: flow.layers[m.from]?.name || m.from, toName: flow.layers[m.to]?.name || m.to,
      kind: m.from === m.to ? 'self' : m.dotted ? 'reply' : 'request',
      labelRaw: m.text, label,
      explain: a ? a.step : '', payload: a ? a.payload : '', refs: a ? a.refs : [],
      section: sectionIdx, branch: m.branch || [],
      key: baseKey + (keyCount[baseKey] > 1 ? '#' + keyCount[baseKey] : ''),
    };
    flow.steps.push(step);
    if (a && !a.step) flow.lint.push({ line: a.line, msg: `Step ${step.n} (${step.fromName} → ${step.toName}) has no @step`, code: 'no-step', step: idx });
    if (a && a.step.length > 240) flow.lint.push({ line: a.stepLine >= 0 ? a.stepLine : a.line, msg: `Step ${step.n}: @step is ${a.step.length} characters (keep it under 240)`, code: 'long-step', step: idx });
  });
  if (flow.sections.length && flow.sections[0].firstStep > 0) {
    flow.sections.unshift({ name: 'Start', firstStep: 0, count: 0, implicit: true, line: -1 });
    flow.steps.forEach((s) => { s.section = s.section + 1; });
  }
  flow.sections.forEach((s, i) => { s.count = (flow.sections[i + 1]?.firstStep ?? flow.steps.length) - s.firstStep; });
  flow.steps.forEach((s) => { if (s.section < 0) s.section = flow.sections.length ? 0 : -1; });
  if (!ann.title) flow.lint.push({ line: Math.max(ann.typeLine, 0), msg: 'Add %% @title <flow name> so the flow has a name', code: 'no-title' });
  if (flow.mismatch) flow.lint.push({ line: 0, msg: `Matched ${pairs.filter((p) => p[1]).length} of ${mArrows.length} arrows to code lines`, code: 'mismatch' });
  flow.lint.sort((a, b) => a.line - b.line);
  return flow;
}

/* ===================== Tokens (Find, Follow a value) ===================== */
const TOKEN_RE = /\/?[\p{L}\p{N}](?:[\p{L}\p{N}_\-./]*[\p{L}\p{N}])?/gu;
function tokens(text) { return String(text || '').match(TOKEN_RE) || []; }
function isFollowable(tok) { return tok.replace(/^\//, '').length >= 3 && !STOPWORDS.has(tok.toLowerCase()); }
function stepText(step) { return [step.label.join(' '), step.payload, step.explain].join(' \n '); }
function stepTokens(step) {
  if (!step._tok) step._tok = new Set(tokens(stepText(step)).map((t) => t.toLowerCase()));
  return step._tok;
}

'use strict';
/* ===================== Constants and helpers ===================== */
const VERSION = { app: '2.0', mermaid: '12.2.0', jspdf: '4.2.1', spec: 'walkthrough/2' };
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
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

/* ===================== Vocabulary of the walkthrough/2 format ===================== */
const FLOW_TAGS = ['spec', 'title', 'mode', 'scope', 'trigger', 'term', 'layer'];
const STEP_TAGS = ['step', 'payload', 'ref', 'uses', 'effect', 'field', 'schema', 'state', 'async', 'retry', 'timeout', 'idempotent', 'unconfirmed'];
const KNOWN_TAGS = [...FLOW_TAGS, 'section', 'summary', ...STEP_TAGS];
const PAYLOAD_PARTS = ['headers', 'query', 'params', 'cookies', 'body', 'sql', 'event', 'input', 'result'];
const PART_LABEL = { headers: 'Headers', query: 'Query', params: 'Path params', cookies: 'Cookies', body: 'Body', sql: 'SQL', event: 'Event', input: 'Input', result: 'Result', _: 'Payload' };
const LAYER_KINDS = { person: '👤', client: '🖥', edge: '🛡', middleware: '⚙', service: '🧩', worker: '🛠', db: '🗄', cache: '⚡', queue: '📨', external: '🌐' };
const LAYER_ZONE = { person: 'client', client: 'client', edge: 'ours', middleware: 'ours', service: 'ours', worker: 'ours', db: 'ours', cache: 'ours', queue: 'ours', external: 'outside' };
const USES_KINDS = ['hook', 'cron', 'listener', 'job', 'worker', 'util', 'config', 'env', 'cache', 'flag', 'migration', 'test', 'lib'];
const FLAG_TAGS = ['async', 'retry', 'timeout', 'idempotent'];
/** Pastel hues, one per chapter, reused in order when a flow has more chapters than hues. */
const CHAPTER_HUES = [210, 150, 30, 280, 0, 180, 60, 330];
const HTTP_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S*|https?:\/\/\S+)/;
const STATUS_RE = /^([1-5]\d\d)\b\s*(.*)$/;
/** General meaning of common status codes, shown next to the project's own message. */
const STATUS_TEXT = {
  200: 'OK: the request worked and the answer is in the body.',
  201: 'Created: a new record exists now; the body or Location header says where.',
  202: 'Accepted: the work was queued and will finish later.',
  204: 'No Content: it worked and there is nothing to send back.',
  301: 'Moved Permanently: use the new address from now on.',
  302: 'Found: go to the address in the Location header, just this once.',
  304: 'Not Modified: the cached copy is still good.',
  400: 'Bad Request: the request itself is malformed.',
  401: 'Unauthorized: no valid identity was presented; sign in or refresh the token.',
  403: 'Forbidden: the identity is known but may not do this.',
  404: 'Not Found: nothing lives at this address or id.',
  405: 'Method Not Allowed: the path exists but not with this method.',
  408: 'Request Timeout: the server gave up waiting for the request.',
  409: 'Conflict: the request clashes with the current state, such as a duplicate or a version mismatch.',
  410: 'Gone: it existed once and was removed on purpose.',
  412: 'Precondition Failed: an If-Match or similar condition did not hold.',
  413: 'Payload Too Large: the body is over the limit.',
  415: 'Unsupported Media Type: the Content-Type is not accepted.',
  422: 'Unprocessable Entity: the request is well formed but a value fails validation.',
  423: 'Locked: the resource is locked by someone else.',
  425: 'Too Early: the server will not risk a replay yet.',
  429: 'Too Many Requests: rate limit hit; wait for Retry-After.',
  500: 'Internal Server Error: an unexpected failure on our side.',
  502: 'Bad Gateway: an upstream service answered badly.',
  503: 'Service Unavailable: overloaded or down for maintenance.',
  504: 'Gateway Timeout: an upstream service did not answer in time.',
};
const SEQ_KEYWORD = /^(participant|actor|note|loop|alt|else|opt|par_over|par|and|critical|option|break|rect|end|activate|deactivate|autonumber|box|create|destroy|title|acctitle|accdescr|links?|properties|details|sequencediagram)\b/i;
const STOPWORDS = new Set('the and with for from that this then than are was were has have had not but you your our its into onto out over under via per any all can will may each also just only more most such what when where which while who why how yes use uses used get got set put new old one two too off own same other again key'.split(' '));
const REF_RE = /^(https?:\/\/\S+|\S+:\d+(?:-\d+)?)$/;

/* ===================== Annotations ===================== */
const Annotations = {
  /** Splits the code into lines and finds annotations, arrow lines and the diagram type. */
  parse(code) {
    const lines = String(code ?? '').replace(/\r\n?/g, '\n').split('\n');
    const res = {
      lines, title: '', titleLine: -1, fmTitle: '', kwTitle: '', spec: '', mode: '', scope: '', trigger: '', summary: [],
      terms: [], layers: {}, sectionSummaries: {}, arrows: [],
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
    const newPending = () => ({
      step: [], stepLine: -1, payload: [], refs: [], uses: [], effects: [], fields: [], schema: [], state: { before: [], after: [] },
      flags: {}, unconfirmed: [], section: null, sectionLine: -1, firstLine: -1, lines: [],
    });
    let pending = newPending();
    const hasStepContent = (p) => p.step.length || p.payload.length || p.refs.length || p.uses.length || p.effects.length || p.fields.length
      || p.schema.length || p.state.before.length || p.state.after.length || Object.keys(p.flags).length || p.unconfirmed.length;
    let inAccBlock = false;
    let lastSection = null; // { name, line, used }
    const warn = (line, msg, code) => res.lint.push({ line, msg, code });

    for (; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();
      if (!t) continue;
      if (inAccBlock) { if (t.includes('}')) inAccBlock = false; continue; }
      const am = t.match(/^%%\s*@([A-Za-z]+(?:\.[A-Za-z]+)?)\b[ \t]?(.*)$/);
      if (am) {
        const [tag, part] = am[1].toLowerCase().split('.');
        const val = am[2].trim();
        if (pending.firstLine < 0) pending.firstLine = i;
        const stepTag = STEP_TAGS.includes(tag);
        if (stepTag) pending.lines.push(i);
        switch (tag) {
          case 'spec': res.spec = val; break;
          case 'title': res.title = val; res.titleLine = i; break;
          case 'mode': res.mode = val.toLowerCase(); break;
          case 'scope': res.scope = val; break;
          case 'trigger': res.trigger = val; break;
          case 'term': {
            const m = val.match(/^(.{1,60}?)\s*:\s+(.+)$/) || val.match(/^(\S+)\s+(.+)$/);
            if (m) {
              const term = m[1].trim();
              const prev = res.terms.findIndex((x) => x.term.toLowerCase() === term.toLowerCase());
              const entry = { term, def: m[2].trim(), line: i };
              if (prev >= 0) res.terms[prev] = entry; else res.terms.push(entry);
            } else warn(i, '@term needs a word and a definition: @term tombstone: …', 'term-empty');
            break;
          }
          case 'layer': {
            const m = val.match(/^(\S+)\s*(?:kind=(\S+)\s*)?(.*)$/);
            if (m && m[1]) res.layers[m[1]] = { text: m[3].trim(), kind: (m[2] || '').toLowerCase(), line: i };
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
          case 'summary':
            if (lastSection) (res.sectionSummaries[lastSection.line] ||= []).push(val);
            else res.summary.push(val);
            if (lastSection && !lastSection.used) pending.lines.push(i);
            break;
          case 'step': if (pending.stepLine < 0) pending.stepLine = i; pending.step.push(val); break;
          case 'payload':
            if (part && !PAYLOAD_PARTS.includes(part)) warn(i, `Unknown payload part "${part}" (known: ${PAYLOAD_PARTS.join(', ')})`, 'payload-part');
            pending.payload.push({ part: part && PAYLOAD_PARTS.includes(part) ? part : '_', text: val, line: i });
            break;
          case 'ref': if (val) pending.refs.push(val); break;
          case 'uses': {
            const u = parseUses(val);
            if (u) pending.uses.push({ ...u, line: i });
            else warn(i, '@uses needs a kind and a name: @uses hook useCart …', 'uses-format');
            break;
          }
          case 'effect': if (val) pending.effects.push(val); break;
          case 'field': {
            const m = val.match(/^(\S+)\s+(.+)$/);
            if (m) pending.fields.push({ name: m[1], text: m[2].trim() });
            else warn(i, '@field needs a name and where it comes from', 'field-empty');
            break;
          }
          case 'schema': {
            const m = val.match(/^(\S+)\s+(.+)$/);
            if (m) pending.schema.push({ field: m[1], text: m[2].trim() });
            else warn(i, '@schema needs a field and its rule', 'schema-empty');
            break;
          }
          case 'state': {
            const m = val.match(/^(before|after)\b\s*(.*)$/i);
            if (m) pending.state[m[1].toLowerCase()].push(m[2].trim());
            else warn(i, '@state needs before or after', 'state-kind');
            break;
          }
          case 'async': case 'retry': case 'timeout': case 'idempotent':
            pending.flags[tag] = val || true;
            break;
          case 'unconfirmed': pending.unconfirmed.push(val || 'Not confirmed from the code'); break;
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
        payloads: pending.payload.slice(),
        refs: pending.refs.slice(),
        uses: pending.uses.slice(),
        effects: pending.effects.slice(),
        fields: pending.fields.slice(),
        schema: pending.schema.slice(),
        state: { before: pending.state.before.join('\n'), after: pending.state.after.join('\n') },
        flags: { ...pending.flags },
        unconfirmed: pending.unconfirmed.slice(),
        section: pending.section,
        sectionLine: pending.sectionLine,
        annLines: pending.lines.slice(),
      };
      if (pending.section != null && lastSection) lastSection.used = true;
      res.arrows.push(arrow);
      pending = newPending();
    }
    if (hasStepContent(pending)) warn(pending.lines[0] ?? lines.length - 1, 'Annotation has no arrow after it', 'orphan');
    if (lastSection && !lastSection.used) warn(lastSection.line, `Chapter "${lastSection.name || '(no name)'}" has no steps`, 'empty-section');
    return res;
  },
};

/** `@uses <kind> <name> [path:line] <text>` */
function parseUses(val) {
  const words = val.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const kind = words[0].toLowerCase();
  const name = words[1];
  let ref = '';
  let rest = words.slice(2);
  if (rest.length && REF_RE.test(rest[0]) && !/^https?:\/\/$/.test(rest[0])) { ref = rest[0]; rest = rest.slice(1); }
  return { kind, name, ref, text: rest.join(' ') };
}

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
  let blockId = 0;
  for (const m of db.getMessages()) {
    const t = m.type;
    if (BLOCK_START[t] !== undefined) { stack.push({ id: ++blockId, kind: BLOCK_START[t], label: decodeEntities(typeof m.message === 'string' ? m.message : ''), first: true }); continue; }
    if (BLOCK_MID[t] !== undefined) { if (stack.length) stack[stack.length - 1] = { id: stack[stack.length - 1].id, kind: BLOCK_MID[t], label: decodeEntities(typeof m.message === 'string' ? m.message : ''), first: false }; continue; }
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
    mode: ann.mode, proposed: ann.mode === 'proposed', scope: ann.scope, trigger: ann.trigger, summary: ann.summary.join('\n'),
    terms: ann.terms.slice(), layers: {}, participants: [], sections: [], steps: [], lint: ann.lint.slice(), mismatch: false,
    uses: [], effects: [], data: [], endings: [], unconfirmed: 0, boundaries: [],
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
  for (const p of parts) {
    const l = ann.layers[p.alias];
    const kind = l && LAYER_KINDS[l.kind] ? l.kind : (p.type === 'actor' ? 'person' : '');
    flow.layers[p.alias] = { name: p.name, desc: l?.text || '', kind, icon: LAYER_KINDS[kind] || '', zone: LAYER_ZONE[kind] || '' };
  }
  for (const [alias, l] of Object.entries(ann.layers)) {
    if (!flow.layers[alias]) flow.lint.push({ line: l.line, msg: `@layer ${alias}: no participant has this alias`, code: 'unknown-alias' });
  }
  // Trust boundaries: between neighbours whose zones differ (only when both have a kind).
  for (let i = 1; i < parts.length; i++) {
    const a = flow.layers[parts[i - 1].alias], b = flow.layers[parts[i].alias];
    if (a.zone && b.zone && a.zone !== b.zone) flow.boundaries.push({ left: parts[i - 1].alias, right: parts[i].alias, from: a.zone, to: b.zone });
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
      flow.sections.push({ name: a.section, firstStep: idx, count: 0, line: a.sectionLine, summary: (ann.sectionSummaries[a.sectionLine] || []).join('\n') });
      sectionIdx = flow.sections.length - 1;
    }
    const label = splitLabel(m.text);
    const baseKey = `${m.from}→${m.to}|${label.join(' / ')}`;
    keyCount[baseKey] = (keyCount[baseKey] || 0) + 1;
    const payloads = (a ? a.payloads : []).map((p) => ({ part: p.part, text: p.text }));
    const http = label[0].match(HTTP_RE);
    const status = label[0].match(STATUS_RE);
    const step = {
      idx, n: idx + 1, line: a ? a.line : -1, annLines: a ? a.annLines : [],
      from: m.from, to: m.to,
      fromName: flow.layers[m.from]?.name || m.from, toName: flow.layers[m.to]?.name || m.to,
      kind: m.from === m.to ? 'self' : m.dotted ? 'reply' : 'request',
      labelRaw: m.text, label,
      explain: a ? a.step : '',
      payloads, payload: joinPayloads(payloads),
      refs: a ? a.refs : [], uses: a ? a.uses : [], effects: a ? a.effects : [], fields: a ? a.fields : [], schema: a ? a.schema : [],
      state: a ? a.state : { before: '', after: '' }, flags: a ? a.flags : {}, unconfirmed: a ? a.unconfirmed : [],
      http: http ? { method: http[1], path: http[2] } : null,
      status: status ? { code: +status[1], reason: status[2].trim() } : null,
      section: sectionIdx, branch: m.branch || [],
      key: baseKey + (keyCount[baseKey] > 1 ? '#' + keyCount[baseKey] : ''),
      replies: [], answers: -1,
    };
    step.isError = step.kind === 'reply' && !!step.status && step.status.code >= 400;
    step.inElse = step.branch.some((b) => b.kind === 'else');
    flow.steps.push(step);
    flow.unconfirmed += step.unconfirmed.length;
    if (a && !a.step) flow.lint.push({ line: a.line, msg: `Step ${step.n} (${step.fromName} → ${step.toName}) has no @step`, code: 'no-step', step: idx });
    if (a && a.step.length > 240) flow.lint.push({ line: a.stepLine >= 0 ? a.stepLine : a.line, msg: `Step ${step.n}: @step is ${a.step.length} characters (keep it under 240)`, code: 'long-step', step: idx });
  });
  if (flow.sections.length && flow.sections[0].firstStep > 0) {
    flow.sections.unshift({ name: 'Start', firstStep: 0, count: 0, implicit: true, line: -1, summary: '' });
    flow.steps.forEach((s) => { s.section = s.section + 1; });
  }
  flow.sections.forEach((s, i) => {
    s.count = (flow.sections[i + 1]?.firstStep ?? flow.steps.length) - s.firstStep;
    s.hue = CHAPTER_HUES[i % CHAPTER_HUES.length];
    s.idx = i;
  });
  flow.steps.forEach((s) => { if (s.section < 0) s.section = flow.sections.length ? 0 : -1; });

  // Request ↔ reply pairs: a dashed B→A answers the nearest earlier solid A→B.
  flow.steps.forEach((s) => {
    if (s.kind !== 'reply') return;
    for (let j = s.idx - 1; j >= 0; j--) {
      const r = flow.steps[j];
      if (r.kind === 'request' && r.from === s.to && r.to === s.from) { s.answers = j; r.replies.push(s.idx); break; }
    }
  });
  const main = flow.steps.find((s) => s.http) || flow.steps.find((s) => s.kind === 'request');
  flow.main = main ? main.idx : -1;
  flow.endings = main ? main.replies.map((i) => flow.steps[i]) : flow.steps.filter((s) => s.kind === 'reply' && s.to === parts[0]?.alias);

  // Side parts, effects and data touched, for the whole flow.
  const usesMap = new Map();
  for (const s of flow.steps) {
    for (const u of s.uses) {
      const k = `${u.kind}|${u.name}`;
      const e = usesMap.get(k) || { kind: u.kind, name: u.name, ref: '', text: '', steps: [] };
      if (!e.ref && u.ref) e.ref = u.ref;
      if (u.text && (!e.text || u.text.length > e.text.length)) e.text = u.text;
      e.steps.push(s.idx);
      usesMap.set(k, e);
    }
    for (const t of s.effects) flow.effects.push({ text: t, step: s.idx });
  }
  flow.uses = [...usesMap.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  flow.data = dataTouched(flow.steps);

  if (!ann.title) flow.lint.push({ line: Math.max(ann.typeLine, 0), msg: 'Add %% @title <flow name> so the flow has a name', code: 'no-title' });
  if (flow.mismatch) flow.lint.push({ line: 0, msg: `Matched ${pairs.filter((p) => p[1]).length} of ${mArrows.length} arrows to code lines`, code: 'mismatch' });
  flow.lint.sort((a, b) => a.line - b.line);
  return flow;
}

/** One plain-text payload for Find, exports and v1 code paths. */
function joinPayloads(payloads) {
  return payloads.map((p) => (p.part === '_' ? p.text : `${PART_LABEL[p.part]}: ${p.text}`)).join('\n').trim();
}

/** Tables and operations read out of SQL payloads and SQL-looking labels. */
function dataTouched(steps) {
  const map = new Map();
  const add = (table, op, idx) => {
    const t = table.replace(/^["'`]|["'`]$/g, '');
    const e = map.get(t.toLowerCase()) || { table: t, ops: new Set(), steps: new Set() };
    e.ops.add(op); e.steps.add(idx);
    map.set(t.toLowerCase(), e);
  };
  for (const s of steps) {
    const texts = [...s.payloads.filter((p) => p.part === 'sql' || p.part === '_').map((p) => p.text), s.label.join(' ')];
    for (const text of texts) {
      const op = (text.match(/\b(SELECT|INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i) || [])[1];
      if (!op) continue;
      for (const m of text.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][\w.]*)/gi)) {
        if (/^(SELECT|SET|WHERE|VALUES)$/i.test(m[1])) continue;
        add(m[1], op.toUpperCase(), s.idx);
      }
    }
  }
  return [...map.values()].map((e) => ({ table: e.table, ops: [...e.ops], steps: [...e.steps] })).sort((a, b) => a.table.localeCompare(b.table));
}

/** Added, removed and changed top-level fields between two JSON-looking payload bodies. */
function payloadDiff(fromText, toText) {
  const parse = (t) => { try { const v = JSON.parse(String(t || '').trim()); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
  const a = parse(fromText), b = parse(toText);
  if (!a || !b) return null;
  const added = Object.keys(b).filter((k) => !(k in a));
  const removed = Object.keys(a).filter((k) => !(k in b));
  const changed = Object.keys(b).filter((k) => k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return { added, removed, changed };
}

/** The body-like payload text of a step: the body part, else the first JSON-looking part. */
function bodyText(step) {
  const body = step.payloads.find((p) => p.part === 'body');
  if (body) return body.text;
  const json = step.payloads.find((p) => /^\s*\{/.test(p.text));
  return json ? json.text : '';
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

# Version 2 internals the React viewer must keep

Facts copied from `src/js/*.js`, `src/body.html`, `src/style.css` and `build.py` of the version 2 page. Strings in code font are exact. Parser facts (tags, lint codes, `STATUS_TEXT`, `CHAPTER_HUES`, `LAYER_KINDS`, `LAYER_ZONE`, step `key`) already live in `packages/core`; they are referenced, not repeated. Where the code has no answer this document says so.

---

## 1. Storage (`localStorage`, prefix `swv:`)

`Store` (core.js) probes storage with the key `__swv_probe`; if `localStorage` throws, every read and write goes to an in-memory object for the session (`Store.ok === false`). Values are JSON. `Store.keys(prefix)` lists keys from both.

| Key | Written by | JSON shape | Defaults / notes |
|---|---|---|---|
| `swv:settings` | `saveSettings()` | `{ theme, wheel, dim, grid, speed, bands, fold?, cardH? }` | `theme: 'redux-color'`, `wheel: 'scroll'` (`'scroll' \| 'zoom'`), `dim: false`, `grid: true`, `speed: 3000` (ms; select offers 1000–5000), `bands: true`, `fold: { top?: boolean, bar?: boolean }` (folded header / step bar), `cardH: number` px (step-bar card height, 90 … 0.75 × window height; deleted on reset). Loaded with `Object.assign(defaults, stored)`; the code treats `bands !== false` and `grid !== false` as on. |
| `swv:code` | `App.autosave` (debounced 400 ms on every editor change and `Editor.setCode`) | string: the full editor text | Read at start when the URL fragment has no diagram; empty/blank → the default diagram. |
| `swv:notes:<flowId>` | `Notes.save()` | `{ [stepKey]: { star: boolean, note: string, n: number, route: string, label: string, updated: string } }` | `n` = 1-based step number, `route` = `"FromName → ToName"` or `"Name ↻ itself"`, `label` = label lines joined by `" / "`, `updated` = ISO timestamp. Entries with `star === false` and a blank note are deleted on save. |
| `swv:terms:<flowId>` | `Glossary.persist()` | `{ [term.toLowerCase()]: { term: string, def: string, updated: string } }` | Saved AI answers and terms added in the Insight Glossary form. `@term` lines from the code are **not** stored; they are merged at run time and win over a saved term with the same lower-cased word. |
| `swv:ai` | `Ask.save()` | `{ provider, keys, models, customUrl, includePayload, autoNote, mode }` | `provider: 'groq'` (one of the ids in §6), `keys: { [providerId]: string }` (API keys, plain text), `models: { [providerId]: string }` (only when different from the provider default), `customUrl: ''`, `includePayload: true`, `autoNote: true`, `mode: 'project'` (`'project' \| 'general'`). |
| `swv:ai:cache` | `Ask.run()` | `{ [hash]: { a: string, t: number } }` | `hash = hashStr(provider + '\|' + userMessage)`; `t = Date.now()`; trimmed to the 200 newest entries. |

**flowId** (`Notes.flowId`): `'t:' + flow.title` when the code has a `@title`, else `'p:' + hashStr(participantAliases.join(','))`.

**hashStr** (core.js): FNV-1a 32-bit over UTF-16 code units (`h = 2166136261; h ^= c; h = Math.imul(h, 16777619)`), result `(h >>> 0).toString(36)`.

**Step key** (`buildFlow`, already in `packages/core`): `` `${from}→${to}|${label.join(' / ')}` `` with U+2192 arrow, plus `#n` (n ≥ 2) for the n-th repeat of the same key in the flow. `label` is the Mermaid message text, entity-decoded, split on `<br>` and trimmed. Notes, bookmarks and the AI `step` field are keyed by this string, so an arrow whose from/to/label did not change keeps its note.

**Notes adoption** (`Notes.adopt`): when the current flowId has no stored notes, every other `swv:notes:*` set is scored by how many of its keys exist in this flow; the best set with `hits * 2 >= entries` is moved to the new id (old key deleted). A toast `Your notes moved with this flow (N steps)` is shown unless the set belonged to the flow displayed just before (title being typed).

**Notes export file**: `<title> notes.json` = `{ "format": "swv-notes/1", "flow": <title>, "flowId": <id>, "exported": <ISO>, "notes": <the map above> }`. Import (`Notes.importObj`) requires `notes` to be an object, keeps the entry whose `updated` string is greater, returns the count of entries written; errors: `This file has no notes in it`.

## 2. URL formats, links and import

### Viewer share link (`Exporter.share`)
- Fragment: `#z.` + `base64url(deflate(code))`. `deflate` = `CompressionStream('deflate')` on the UTF-8 bytes (zlib-wrapped DEFLATE, RFC 1950, as produced by the browser). `base64url` = standard base64 with `+`→`-`, `/`→`_`, trailing `=` removed.
- Open-on-step: `&step=N` appended (1-based) when a step is current. Full link: `location.href.split('#')[0] + fragment`.
- In a Claude artifact (`window.claude` defined) only the fragment is copied; toast: `Copied the code fragment for a viewer link that opens on step N. Add it to the end of this page's link.`
- Toasts otherwise: `Copied a viewer link with the code inside` / `Copied a viewer link that opens on step N`.

### Reading the fragment at start (`App.init`)
`location.hash` without `#`, split on `&`; parts recognised in any order:
- `z.<data>` → inflate(base64url-decode) = the code.
- `pako:<data>` or `base64:<data>` → mermaid.live state (see below); its `code` is used (theme ignored here).
- `step=N` or `step-N` (regex `/^step[=-]\d+$/`) → `App.hashStep`; after the first successful sequence render `Walk.go(N-1)`.
Precedence: fragment code > `swv:code` > default diagram. Decode failure → toast `The code in this link could not be read, so the saved code is shown`. Success → toast `Loaded the diagram from the link`.

### mermaid.live link (`Codec.liveLink`)
`'https://mermaid.live/edit#pako:' + base64url(deflate(JSON.stringify(state)))` with
```json
{ "code": "<code>", "mermaid": "{\n  \"theme\": \"<settings.theme>\"\n}", "autoSync": true, "rough": false, "updateDiagram": true, "panZoom": true, "grid": <settings.grid> }
```
(`mermaid` is itself a JSON string made with `JSON.stringify({ theme }, null, 2)`). "Open in mermaid.live" clicks a temporary `<a target="_blank" rel="noopener noreferrer">`.

### Reading a mermaid.live link (`Codec.fromLive`)
Regex `/#(pako|base64):([A-Za-z0-9\-_+/=]+)/`; `pako` → inflate(unb64), `base64` → plain base64 decode; parse JSON; returns `{ code: st.code || '', theme }` where theme comes from `JSON.parse(st.mermaid).theme`. Error: `This is not a mermaid.live link`. When imported through `Importer.fromText` and the theme is one of the eight offered, `App.setTheme(theme, false)` is applied first; toast `Loaded the diagram from the mermaid.live link`.

### Importer
- `isLiveLink(t)`: `/^\s*https?:\/\/(www\.)?mermaid\.(live|ink)\/[^\s]*#(pako|base64):/`.
- `looksLikeMermaid(t)`: first non-blank line that is not `%%…` and not `---` matches `/^(sequenceDiagram|flowchart|graph|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|xychart|sankey|block|packet|kanban|architecture|requirementDiagram|C4)/`.
- `extractMarkdown(t)`: first match of ``/```\s*mermaid[^\n]*\n([\s\S]*?)```/i``, trailing newline removed; `null` when absent.
- `fromText(t)`: live link → as above; else `extractMarkdown(t) ?? t` → `Editor.setCode(code, { fit: true })`. Failure toast `Could not import: <message>`.
- `fromFile(file)`: extension must be one of `mmd`, `md`, `txt`, `mermaid`, `markdown` (else toast `Drop a .mmd, .md or .txt file`); `md`/`markdown` go through `extractMarkdown` (none → toast ``<name> has no ```mermaid block``); toast `Loaded <name>`. `#fileInput` has `accept=".mmd,.md,.txt,.mermaid,text/plain,text/markdown"`; `#notesInput` `accept=".json,application/json"`.
- Where paste is handled: in the editor textarea a live link is intercepted (`Importer.fromText`), other pastes render immediately; outside inputs (`document` paste) a live link or mermaid-looking text is loaded; drag-and-drop of files anywhere on the window shows the `.drop-ov` scrim `Drop a .mmd, .md or .txt file` and loads the first file.

## 3. Keyboard map and pointer interactions

### Keys (`bindKeys`, `document` keydown)
Ignored when: `ev.defaultPrevented`; a modal is open (except Esc); the target is an `input, textarea, select, [contenteditable]`; Ctrl, ⌘ or Alt is held. Space/Enter on a focused `<button>` are left to the button. ↑/↓ inside `.tv-scroll` are left to the table. Letters are bound in both cases.

| Key | Action |
|---|---|
| `ArrowRight` / `ArrowLeft` | `Walk.next()` / `Walk.prev()` (skip path-hidden steps, honour chapter lock; prev from step 1 goes to the overview) |
| `Home` / `End` | step 1 / last step |
| `[` / `]` | `Chapters.prev()` / `Chapters.next()` |
| `K` | toggle chapter lock |
| `Space` | play / pause |
| `ArrowUp` / `ArrowDown` | pan 80 px (diagram view only) |
| `+` `=` / `-` `_` | zoom ×1.25 / ×0.8 at the canvas centre |
| `0` / `F` | fit width / fit all |
| `T` | diagram ↔ table |
| `I` | Insight panel |
| `A` | Ask panel for the current step |
| `H` | hide controls (toggle) |
| `P` | presenter mode (toggle) |
| `C` | code panel (toggle) |
| `B` / `N` | bookmark / note editor on the current step |
| `/` | Find |
| `?` | shortcuts dialog |
| `Escape` | `Shell.escape()` cascade: modal → menus, context menu, bookmark/Behind/term popovers → Find → Ask → note editor → Follow → spotlight → path filter → hide mode → Insight → code panel → table view (phone width only) → stop playing → overview (`Walk.go(-1, { camera: false })`). Esc inside the editor textarea runs the same cascade; inside a `<select>` it is left alone. |

Local keys: `#stepInput` Enter jumps, Esc restores; `#noteTa` Esc saves and closes; `#findInput` Enter next / Shift+Enter previous / Esc close; `#wbResize` ↑/↓ ±20 px; editor caret movement (Arrow/Page/Home/End keyup) and clicks select the step whose arrow or annotation lines hold the caret.

### Pointer and wheel
| Gesture | Where | Effect |
|---|---|---|
| Drag (button 0 or touch, ≥5 px) | canvas | pan; `canvas.dragging` class |
| Two pointers | canvas | pinch zoom around the midpoint, range 0.1–8 |
| Click (no movement) | arrow line / label / number / `.swv-hit` with `data-step` | `Walk.go(step)` |
| Click | `.swv-actor` (diagram or pinned header) | `Spot.toggle(alias)` |
| Hover (mouse only) | `.swv-actor` → layer tooltip; `[data-step]` → step tooltip; pointer leave / down hides |
| Double-click | arrow label `<text>` | Follow the token under the pointer (`getCharNumAtPosition`, `TOKEN_RE`) |
| Wheel | canvas | Ctrl/⌘: `zoomAt(p, exp(-dy*0.01))`; wheel mode zoom: `exp(-dy*0.0025)`; Shift with no deltaX: pan x by −dy; else pan by (−dx, −dy). `deltaMode` 1 → ×16 px, 2 → × canvas height. Over `.cv-controls` ignored. |
| Wheel | `#wbar` | step: accumulate the dominant delta; fire when |acc| ≥ 40 and ≥160 ms since the last; reset after 250 ms idle; the centre card scrolls first while it can; ignored over `textarea, input, select` and for horizontal wheel over `.chapters` |
| Wheel | `#gutter` | forwards to the textarea scroll |
| Drag / dblclick | `#wbResize` | card height / reset (toast `Step bar height reset`) |
| Right-click | anywhere except `textarea, input` with exactly one followable token selected | `.ctx` menu: `Follow “w”`, `Ask AI: what is “w”?` |
| Click | `#cardPrev` / `#cardNext` | go to that step |
| Click / dblclick | table row | go (camera untouched) / switch to diagram and go |
| Outside click | closes menus, bookmark/Behind/term popovers, context menu |

## 4. Mermaid usage and SVG decoration

### Loading and initialising
- Script URLs, in order: `https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.min.js`, `https://unpkg.com/mermaid@12.2.0/dist/mermaid.min.js` (`async`, `crossorigin="anonymous"`). jsPDF: `https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js`, `https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js`, loaded only for PDF export. `VERSION = { app: '2.0', mermaid: '12.2.0', jspdf: '4.2.1', spec: 'walkthrough/2' }`.
- `mermaid.initialize({ startOnLoad: false, theme: settings.theme, securityLevel: 'strict' })` on every theme change.
- Themes offered (select order): `redux-color`, `redux`, `redux-dark`, `redux-dark-color`, `default`, `dark`, `neutral`, `forest`. Canvas background: `mermaid.mermaidAPI.getConfig().themeVariables.background` unless missing or `'transparent'`, then `#1e1e1e` if `/dark/.test(theme)` else `#ffffff`. `themeDark = luminance(bg) < 0.4` (sRGB 0.2126/0.7152/0.0722 of the canvas-normalised hex). Grid dot colour `--grid-dot`: dark `rgba(220,225,235,.22)`, light `rgba(90,100,120,.28)`.
- Render pipeline per edit: `Annotations.parse(code)` → `Fonts.ensure(code)` → `await mermaid.parse(code)` (error → `Renderer.fail`) → for `sequenceDiagram`, `mermaidInfo(await mermaid.mermaidAPI.getDiagramFromText(code))` (participants, arrows in drawing order with block nesting; `db.getActors()`, `db.getMessages()`; message type ids in core.js `DOTTED_TYPES`, `BLOCK_START`, `BLOCK_MID`, `BLOCK_END`, `NON_ARROW`) → `mermaid.render('swv' + seq, code)`; stale renders are dropped by sequence number. Mount: viewBox read (fallback width/height attributes), `style` removed, `width`/`height` set to the viewBox size; `S.cleanSvg = svg.outerHTML` kept for exports before any decoration.
- Fonts: `<style id="swv-font-css">` holds Google Fonts' CSS for "Recursive" with the four woff2 subsets (`cyrillic-ext`, `vietnamese`, `latin-ext`, `latin`) as `data:font/woff2;base64` URIs. `Fonts.init` re-registers each `@font-face` under the family name `"Recursive Variable"` (the name the redux themes use) via `document.fonts.add(new FontFace(...))`, then `document.fonts.load('400 16px "Recursive Variable"', sample)` and `700` before every render, racing a 4 s timeout.
- Error line mapping `mermaidLineToCode(code, n)`: Mermaid's line numbers skip front matter, every `%%` comment line that is not `%%{…}%%`, and blank lines directly above such a comment; leading blank or `%%{…}%%` lines are also skipped. The function rebuilds the kept-line list and returns `kept[n-1]`.

### Arrow ↔ step mapping (`Mapper.tag`)
Walk `svg.querySelectorAll('.messageText, .messageLine0, .messageLine1, .sequenceNumber')` in document order: `.messageText` nodes accumulate; a `.messageLine0`/`.messageLine1` closes an arrow entry `{ line, texts, num }`; a following `.sequenceNumber` attaches to the last entry. Entry *i* is step *i* (`flow.steps[i]`); every element gets `data-step="i"`. Count mismatch adds lint `dom-mismatch` ("Mermaid drew n arrows but m were read; highlights may be off") and the list is truncated. Participants: `.actor-top[name="<alias>"]` and `.actor-bottom[name="<alias>"]` → the enclosing `<g>` (`actorGroup`) gets `data-alias` and class `swv-actor`.

### Geometry (`Mapper.measure`)
Boxes in viewBox coordinates via `getBBox()` transformed by `inv(svg.getScreenCTM()) × el.getScreenCTM()`. Per step: `lineBox`, `labelBox`, `numBox`, `box` = union + 8 px padding. `S.geo = { actors: { [alias]: { top, bottom } }, rowTop, rowBottom, bottomTop, hdrTop: rowTop - 6, hdrH: rowBottom - rowTop + 12 }`.

### Hit areas (`Mapper.addHits`)
After each line: a clone of the line with `class="swv-hit" data-step="i" style="stroke: transparent; stroke-width: 16px; fill: none; pointer-events: stroke"` and, when there is a label, a `rect.swv-hit` over the label bbox (x−4, y−2, w+8, h+4) with `fill: transparent; pointer-events: all`.

### Sticky header (`Header.build/sync`)
A shallow clone of the `<svg>` with `id="<renderId>-hdr"`, `viewBox="<vb.x> <vb.y + hdrTop> <vb.w> <hdrH>"`, `aria-hidden="true"`, Mermaid's `<style>` elements copied with `#<renderId>` rewritten to `#<renderId>-hdr`, a `<g class="swv-halos">`, and a deep clone of every top actor group wrapped in a `<g transform="matrix(…)">` (the group's parent CTM). Placed in `#hdrLayer` with `transform: translate(Camera.x, top) scale(k)`; `#hdrBand` (canvas-background colour, shadow) gets the same `top`/`height`. Shown when `Camera.y + hdrTop*k < 0`; `top = min(0, (Camera.y + bottomTop*k) - hdrH*k - 4k)`; hidden when `top + hdrH*k ≤ 0`, in table view, or for non-sequence diagrams.

### Decorations (classes and attributes on the SVG)
| Class / element | Set by | Meaning |
|---|---|---|
| `[data-step]`, `.swv-actor[data-alias]`, `.swv-hit` | Mapper | mapping |
| `.swv-cur` on line, texts, number | `Hl.apply` | current step |
| `path/line.swv-marker` | `Hl.apply` | clone of the line inserted before it: `stroke: #ffd43b; stroke-opacity: .75 (dark .55); stroke-width: 10px; stroke-linecap: round; stroke-dasharray: none; fill: none` |
| `rect.swv-pill` | `Hl.apply` | behind the label: bbox −6/−2, +12/+4, `rx 5`, fill `#ffe680` @ .9 (dark `#7a5c00` @ .85) |
| `circle.swv-ring` | `Hl.apply` | r 13 at the number centre (or line start), stroke `#f0b400` 3 px |
| `circle.swv-pair` | `Hl.apply` | r 16, stroke `#f0b400` 2 px, `stroke-dasharray: 4 3`, on replies of the current request / the request of the current reply |
| `svg.swv-dim` | `Hl.apply` | `settings.dim && cur >= 0`; CSS `.swv-dim [data-step]:not(.swv-cur) { opacity: .2 }` |
| `svg.swv-chap`, `.swv-outch` | `Hl.chapter` | chapter mode on; arrows of other chapters `.swv-chap [data-step].swv-outch:not(.swv-cur) { opacity: .5 }` |
| `rect.swv-band` ×2, `text.swv-band-label` ×1–2 | `Hl.chapter` | band `x=vb.x, y=vb.y+y0, width=vb.w, rx 6`, fill `hsl(hue 85% 90%)` @ .6 (dark `hsl(hue 45% 28%)` @ .55) where y0/y1 = chapter boxes ±6; edge bar `x=vb.x+2, width 4, rx 2` fill `hsl(hue 60% 32%)` (dark `hsl(hue 70% 80%)`) @ .8; labels `font: 600 11px Recursive, sans-serif`: `▶ <name> · N steps` (`1 step`) at `y0+4` `dominant-baseline: hanging`, `■ end of <name>` at `y1−5` only if `y1−y0 > 40`. Band inserted before the first non-`style`/`defs` child; labels appended last. |
| `svg.swv-spot`, `.swv-out` | `Hl.decorate` | spotlight; `.swv-spot [data-step].swv-out { opacity: .1 }` |
| `svg.swv-path`, `.swv-off` | `Hl.decorate` | path filter; `.swv-path [data-step].swv-off { opacity: .12 }`, `.swv-path .swv-hit.swv-off { cursor: default }` |
| `circle.swv-follow` | `Hl.decorate` | r 17, stroke `#1d5bd0` 3 px, at the number centre |
| `text.swv-star` | `Hl.decorate` | `★` fill `#e0a800` (starred) or `✎` fill `#8a93a3` (note only), at (cx−22, cy−9), `font: 700 15px sans-serif`, white/black 3 px paint-order stroke |
| `line.swv-boundary`, `text.swv-boundary` | `Hl.boundaries` | x = midpoint between neighbouring top actor boxes, from `rowBottom+4` to `bottomTop−4`; `stroke 1.5px; stroke-dasharray: 3 6; opacity .7`, colour `#6b7486` (dark `#9aa4b8`); label `<fromZone> │ <toZone>` at (x+4, y0+12), `font: 600 10px Recursive, sans-serif` |
| `rect.swv-halo` | `Header.setActive` | around the from/to actor groups (top and bottom) and in the header's `.swv-halos`: bbox ±5, `rx 9`, fill `#ffd43b` @ .55 (dark `#ffd43b55` @ 1), stroke `#f0b400` 2 px |

### Camera model (`Camera`)
- State `x, y, k`; `#layer` gets `transform: translate(x px, y px) scale(k)`; class `moving` while animating (removed 180 ms after the last apply). Zoom limits `0.1 … 8`.
- `clampPos`: keeps at least 60 px of the scaled diagram inside the canvas on each axis.
- `zoomAt(px, py, f)`: scales about the canvas point. Toolbar ± use 1.25 / 0.8 at the centre; `#zoomPct` → `zoomTo(1)`.
- `insetLeft()` = code panel width when open and not narrow.
- `fitWidth`: `k = clamp((w − left − 48) / W, 0.1, 8)`, x centred in the remaining width, `y = 24`.
- `fitAll`: `k = clamp(min((w − left − 48)/W, (h − 48)/H), 0.1, 8)`, centred both ways.
- `initial` (first render or `opts.fit`): `k = clamp(min(1, (w − 48)/W), 0.1, 1)`, centred, `y = 24`.
- `visible()`: `{ x0: left+12, y0: hdrH*k + 12 (sequence only), x1: w − 12, y1: h − 56 }`.
- `followStep`: no move if the step box is inside `visible()`; otherwise `ny` puts the box centre at 40 % of the visible height, clamped so the whole box stays inside; `nx` only changes when the box is horizontally outside (centres it); boxes larger than the area centre on the label box. `glideTo` 320 ms, ease `1 − (1 − p)³`, instant under `prefers-reduced-motion` or `ms ≤ 0` (table → diagram switch uses 0).
- Grid: `#canvas.grid` background `radial-gradient(circle, var(--grid-dot) 1px, transparent 1.2px)`, `background-size: 20k px`, `background-position: x px y px`.

### Find and Follow highlighting
- Find searches `[label.join(' '), explain, payload, fromName, toName, chapter name, uses.map(name + ' ' + text), effects].join(' \n ').toLowerCase().includes(q)`; marks table rows `.findhit` (underline on Sends/Does); count text `k of N`, `– of N` when the current step is not a hit, `No match`.
- Tokens: `TOKEN_RE = /\/?[\p{L}\p{N}](?:[\p{L}\p{N}_\-./]*[\p{L}\p{N}])?/gu`; followable when the token minus a leading `/` is ≥ 3 chars and not in `STOPWORDS` (core.js). A step matches when `tokens(label + payload + explain)` (lower-cased) contains the token. UI: `.tok` spans on label and payload text (title `Follow this value`), `.tok.on` for the followed token; Follow strip markup in `Follow.renderStrip`; toasts `"x" is too short or too common to follow` and `"x" does not appear in any step`.
- Glossary underline: `Glossary.regex()` = alternation of all terms (longest first, escaped) with `(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])`, flags `giu`; matches wrapped in `<span class="term" data-term title="<def>">` (`.tok.term` when also a token).

## 5. Exports (`Exporter`, `Table`, `Files`)

**File name** (`Files.base()`): flow title with `[\\/:*?"<>|]` and `[\u0000-\u001f]` removed, whitespace collapsed to one space, trimmed, cut to 120 chars; `Sequence diagram` when empty.

**Saving** (`Files.save`): in a Claude artifact `await claude.use('downloads')` then `downloads.save({ filename, data: blob })` (toast `Saved <name>`; error codes `declined` → silent, `rejected_extension` → toast `.<ext> files can't be saved from this page. The text is the same in a .txt file.` with action `Save as .txt` saving `<name>.txt`); otherwise an object-URL `<a download>` click (toast `Downloaded <name>`). `App.debug.lastSave = { name, size, type }`.

| Format | Output |
|---|---|
| SVG `<title>.svg` | `S.cleanSvg` re-parsed, `xmlns`, `xmlns:xlink`, `width=S.W`, `height=S.H`, `style="background-color: <themeBg>"`; when the SVG text mentions `Recursive`, a `<style>` with `@font-face{font-family:"Recursive Variable";font-style:…;font-weight:…;unicode-range:…;src:url(data:font/woff2;base64,…) format("woff2");}` for every subset covering the characters used is inserted first (toast once `The font could not be embedded here, so the file may use a fallback font.` on failure). MIME `image/svg+xml`. |
| PNG `<title>.png` | the SVG string drawn on a canvas `round(W·s) × round(H·s)` filled with the theme background; `s` starts at 1, 2 or 4 and is multiplied by 0.8 while `W·s > 16000`, `H·s > 16000` or `W·H·s² > 120e6` (down to 0.25); toast `The diagram is large, so the PNG uses <s.toFixed(1)>×` when lowered. |
| Step image `<title> - step N.png` / `<title> - overview.png` | the **live** SVG (clone minus `.swv-hit`) rasterised at `max(1, min(4, 2k))`, cropped to the visible canvas rect in diagram units (`−Camera.x/k … (w−Camera.x)/k`, same for y, clamped to the diagram); when the sticky header is visible the header band (`hdrTop … hdrTop+hdrH`) is painted at `Header.top/k` over the crop. |
| Code `<title>.mmd` | the editor text, `text/plain`. |
| CSV `<title>.csv` | `'﻿'` + rows joined by `\r\n` + trailing `\r\n`; cells quoted (`"` doubled) when they contain `"`, `,`, CR or LF. Columns in order: `Step, Chapter, From, To, Kind, Status, Sends, Does, Branch, Payload, Also involved, Effects, Unconfirmed, Ref` and, with notes, `Bookmarked` (`yes`/empty), `Note`. Values: `n`, chapter name, fromName, toName, kind, status code, `label.join(' / ')`, explain, `branch.map(kind + ' ' + label).join(' > ')`, `payload` (joined parts, `Headers: …` lines), `uses.map(kind name (ref)).join('; ')`, effects `'; '`, unconfirmed `'; '`, refs `' '`. |
| Markdown (clipboard) | `# <title>\n\n<N> steps, <M> layers.\n\n` + optional `**Starts when:** …`, `**Scope:** …`, `**Proposed design:** this flow does not exist in the code yet.`; with chapters one `## <i+1>. <name>\n\n<summary>\n\n<table>` per chapter, else one table; table columns `#`, `From → To`, `Sends` (backticked, inner backticks → `'`), `Does` (`_No explanation_`), `Branch`, `Also involved` (`kind name; effect: …; unconfirmed: …`), `Ref` (+ `Note` = `★ ` + note); cells escape `\|` and turn newlines into `<br>`. Then `## Behind the scenes` (`- **kind** \`name\` (ref): text (steps 1, 4)`) and `## Glossary` (`- **term**: def`). Toast `Copied the step table as Markdown`. |
| Notes `<title> notes.json` | see §1. |
| PDF `<title>.pdf` | see below. |
| Skill kit | `SKILL_KIT.name` = `sequence-walkthrough-skill-kit.zip`, bytes from `SKILL_KIT.b64`, MIME `application/zip`. |

**PDF** (`Exporter.pdfPlan/pdf/pdfTablePages`, jsPDF 4.2.1):
- `new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' | 'letter', compress: true })`; page `297 × 210` mm (letter `279.4 × 215.9`), `margin 10`, `titleH 9`, `footH 6`; content `cw = page.w − 20`, `ch = page.h − 20 − 9 − 6`; `mm = min(cw / W, 0.4)` mm per diagram px.
- Slices: start at `y = 0`; each page holds `room = ch/mm` px minus `hdrH` on pages after the first (sequence diagrams); the cut is moved up to the last gap between consecutive arrow boxes (`(box_i.bottom + box_{i+1}.top) / 2`) that lies in `(y + 0.4·room, y + room]`.
- Raster once at scale 2 (`raster(svgString, 2)`), then per page a canvas with the header strip (pages > 1: rows `hdrTop … hdrTop+hdrH` plus a 2 px `rgba(0,0,0,.12)` line) over the slice. Title label canvas (`6 px/mm`): title (`700 25.2px Recursive`, `#161d29`; `(continued)` on later pages) left and `Page i of N` (`500 19.2px`, `#566072`) right; placed at `(margin, margin)` size `cw × titleH`; the page image at `(margin, margin + titleH)` size `W·mm × (hdrH + slice)·mm`; `doc.addImage(canvas, 'PNG', …, undefined, 'FAST')`.
- Optional table pages (`opts.table`, default checked): canvases `cw × ch` mm at 3.6 px/mm drawn at 2.5× with columns `#` 5 %, `From → To` 20 %, `Sends` 27 %, `Does` 48 % (30 % with notes), `Your note` 18 %; chapter name rows `750 13px`; row text 11 px Recursive / 10.5 px `"Cascadia Mono", Consolas, monospace` for labels, payload (`Payload: …`) and refs in the Does column; page label `<title> – steps`.
- Modal text: `Download PDF`, `Landscape pages. The participant row is repeated at the top of every page.`, `Add the step table at the end`, `Include my notes`, `Paper` A4 / US Letter, `N diagram page(s).`, warning `This is a tall diagram: N pages. Consider a PNG instead.` when > 20, button `Download <base>.pdf`; toast `Making the PDF…`; `App.debug.lastPdf = { pages, diagramPages, tablePages, preview: [dataURL ×≤3] }`.

**Skill kit download**: `build.py` embeds `const SKILL_KIT = { name: 'sequence-walkthrough-skill-kit.zip', b64: '<zip>' }` right after `'use strict';`. The zip holds `sequence-walkthrough-skill-kit/` with every file of `skill-kit/` (`SKILL-SETUP-GUIDE.md`, `install-claude-code.ps1`, `install-claude-code.sh`), `sequence-walkthrough.zip` (the skill folder zipped under `sequence-walkthrough/`, excluding `evals/`, `__pycache__`, `.pyc`) and the unzipped `sequence-walkthrough/` folder; entries sorted, fixed timestamp `2026-10-29 00:00:00`, DEFLATE level 9, mode 0755 for `.sh`/`.py` else 0644. `SKILL.md`'s `description:` must be ≤ 1024 chars or the build fails.

## 6. Ask AI (`ask.js`)

### Providers (`AI_PROVIDERS`, in menu order)
| id | name | url | default model | key | key page |
|---|---|---|---|---|---|
| `groq` | `Groq (free tier)` | `https://api.groq.com/openai/v1/chat/completions` | `llama-3.3-70b-versatile` | yes | `https://console.groq.com/keys` |
| `gemini` | `Google Gemini (free tier)` | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `gemini-2.5-flash` | yes | `https://aistudio.google.com/apikey` |
| `openrouter` | `OpenRouter (free models)` | `https://openrouter.ai/api/v1/chat/completions` | `meta-llama/llama-3.3-70b-instruct:free` | yes | `https://openrouter.ai/keys` |
| `cerebras` | `Cerebras (free tier)` | `https://api.cerebras.ai/v1/chat/completions` | `llama-3.3-70b` | yes | `https://cloud.cerebras.ai` |
| `mistral` | `Mistral (free tier)` | `https://api.mistral.ai/v1/chat/completions` | `mistral-small-latest` | yes | `https://console.mistral.ai/api-keys` |
| `ollama` | `Ollama on this computer (no key)` | `http://localhost:11434/v1/chat/completions` | `llama3.2` | no | — |
| `custom` | `Custom OpenAI-compatible endpoint` | `settings.customUrl` | `''` | optional | — |
| `claude` | `Claude (only when this page runs as a Claude artifact)` | artifact capability | — | no | — |

`ready()`: claude → `typeof window.claude?.use === 'function'`; custom → needs `customUrl`; others → no key needed or a key stored for that provider.

### Request (all providers except `claude`)
```
POST <url>
Content-Type: application/json
Authorization: Bearer <key>            (only when a key is set)
HTTP-Referer: <location.origin || 'https://sequence-walkthrough'>   (openrouter only)
X-Title: Sequence Walkthrough                                       (openrouter only)

{ "model": <models[provider] || default>, "messages": [ { "role": "system", "content": AI_SYSTEM }, { "role": "user", "content": <user> } ], "temperature": 0.2, "max_tokens": 220 }
```
Answer: `json.choices[0].message.content` (else error `The provider sent no answer text`). Non-2xx → `Error("<status> <statusText>: <error.message | message | first 200 chars of JSON>")`. `AbortController` with a 45 000 ms timeout; a new question aborts the previous one. Fetch failures matching `/failed to fetch|networkerror|load failed/i` are shown as `Could not reach <Provider> from this page. The provider may block browser requests; try another provider, or a proxy URL as a custom endpoint.`

### System prompt (`AI_SYSTEM`, exact)
```
You explain one step of a software flow to a developer who is new to this codebase.
Rules: answer in under 60 words. Be as exact as a senior engineer; never invent details about the project.
Use plain words; if you must use a technical term, add two or three words saying what it is.
Give one concrete example when it helps. No greetings, no lists unless asked, no repeating the question.
If the question is about something the context does not cover, say "Not in this diagram:" and then give the general meaning in one sentence.
```
The "60 words" limit is only this instruction plus `max_tokens: 220`; nothing truncates the answer client-side.

### User message
- Project mode (`settings.mode === 'project'`): `` `Context:\n${context}\n\nQuestion: ${q}` `` where `context` lines are, in order and only when present:
  `Flow: <title>` (+ ` (a proposed design, not existing code)`), `Chapter: <name>` (+ ` – <summary>`), `Step <n> of <N>: <fromName> → <toName> (<kind>)`, `Label: <label lines joined ' | '>`, `Explanation: <@step>`, `Branch: <kind label > kind label>`, `Layer <name>: <desc>` for the from and to layers, `Payload: <payload.slice(0, 1200)>` (only if `includePayload`), `Also involved: <kind name text; …>`, `Effects: <…; …>`, `Glossary: <term: def; …>` for `@term` entries (source `code` only) whose word appears in the label or explanation.
- General mode: `` `Question: ${q}` ``.
- Term questions: chips `What is <w>?`, the context menu, the term popover (`Ask AI more`) and the Follow strip's `Ask` call `Ask.term(word)` → question `What is "<word>" here?` with `term = word`; a typed question matching `/^what(?:'s| is| does)\s+"?([^"?]+?)"?\s*(?:mean)?\??$/i` also sets `term`.

### Suggested chips (`Ask.mount`)
`Explain simpler`, `Why this step?`, `What if it fails?`, then up to 6 `What is <w>?` built from: `@term` words (source `code`) present in the label + explanation; then label tokens, then explanation tokens that are followable and "techy" (`/[A-Za-z]/`, not all digits, not an HTTP method, and containing one of `_ / - .` or a digit, or all-caps ≥ 2, or camelCase).

### After an answer
- `autoNote` (default on): `Notes.append(step, "Q: <q>\nA: <answer>")` (joined to an existing note with a blank line) and the hint `Saved to this step's note (edit with N).`; otherwise a `Save to note` button does the same (toast `Saved to the step's note`).
- `Add to glossary` (only when `term` is set): `Glossary.add(term, answer)` → `swv:terms:<flowId>`; toast `"<term>" added to the glossary`.
- `Copy` → clipboard, toast `Copied the answer`.
- Cache: `swv:ai:cache[hashStr(provider + '|' + user)] = { a, t }` (200 newest kept); a hit skips the request.
- Settings modal strings: title `Ask AI`; intro `Short answers about any step or word, from a model you choose. The key is stored only in this browser and is sent only to that provider. Check the provider's current free tier before relying on it.`; `Provider`; `Endpoint URL` (placeholder `https://your-proxy.example/v1/chat/completions`); `API key` (password field, placeholder `Paste the key` / `Optional`), `Get a key at <host>.`; `Model`; Ollama hint `Start Ollama with OLLAMA_ORIGINS=* so this page may call it, and pull a model first (ollama pull llama3.2).`; checkboxes `Include the step's payload in the question (project mode)`, `Save every answer to the step's note, so it can be edited later`; buttons `Test`, `Cancel`, `Save`; test question `Question: Reply with the single word OK.`, results `Testing…`, `Works. The model said: <60 chars>`, `Failed: <msg>`; save toast `AI settings saved in this browser`.

### Claude artifact mode
- Detection: `window.claude && typeof window.claude.use === 'function'`.
- Call: `const sample = await window.claude.use('sample'); const r = await sample([{ role: 'user', content: AI_SYSTEM + '\n\n' + user }], { modelTier: 'quick', cache: false }); return r.text || ''`. (The system prompt is folded into the single user message; there is no separate system role.) Missing capability → `Claude is not available on this page. Open the viewer as a Claude artifact, or pick another provider.`
- Consent: the page has **no consent dialog of its own**. The modal text `Works only when this page is opened as a Claude artifact; the viewer asks the person for consent on the first question.` and the README refer to the host's permission prompt raised by `claude.use('sample')`. (`window.claude.sample` is not used anywhere; it is always `window.claude.use(...)`.)
- Other artifact behaviour: `claude.use('downloads')` requested at load for `Files.save`; `Exporter.share` copies only the fragment; the README says the artifact must be published with the `sample` capability (and `downloads` for exports).

## 7. Insight panel, overview card, table, code panel

### Insight tabs (`Insight.TABS`, with count badges)
| key | label | badge count | content |
|---|---|---|---|
| `layers` | `Layers` | participants | per participant: icon, name, kind chip, alias, `Only this layer` / `Show all`, `@layer` text or `No @layer description.`, `N steps · <chapters touched>`, `Files: <refs of sent steps, :line stripped>`, `Uses: <kind name chips of sent steps>`; footer `Trust boundaries: A │ B; …` or `Add kind= to the @layer lines to get icons and trust-boundary lines.` |
| `endpoints` | `Endpoints` | distinct `METHOD path` labels | table `Call` (method badge `.m-get/.m-post/.m-put/.m-patch/.m-delete`, path, step links) / `From → To` / `Replies` (status chips or `no reply arrow`); empty `No arrow label starts with an HTTP method and a path yet.` |
| `errors` | `Errors` | 4xx/5xx replies + unconfirmed count | table `Status` / `Message` (reason + further label lines, step link, route) / `When` (branch chips or `always`) / `Cause` (explanation); `Not confirmed from the code` list; `**Proposed design:** none of these steps exist in the code yet.`; empty `No reply with a 4xx or 5xx status in this flow.` |
| `behind` | `Behind the scenes` | `@uses` items + effects | `<details open>` per kind (`<kind chip> N items`), items name / ref / text / step links; `effects` group; empty text names `@uses` and `@effect` |
| `glossary` | `Glossary` | terms (code + saved) | sorted `dl`; saved ones get chip `saved answer` and `Edit` (`Modal.prompt('Edit definition')`) / `Delete`; form `#glAdd` `Term` + `Definition in one sentence` + `Add`; footer `Saved terms stay in this browser. Underlined words on the cards open their definition.`; empty `No terms yet. The skill writes %% @term word: definition lines; answers you save from Ask AI land here too.` |
| `data` | `Data` | tables touched | `Tables touched` (`Table` / `Operations` chips / `Steps`) from `dataTouched` (core); `Files in this flow` from `@ref` paths; empty texts `No SQL found in payloads or labels. Write queries as @payload.sql … to list the tables here.` and `No @ref lines yet.` |

Panel: `#insightPanel` right side, width `min(520px, 92%)`, `body.insight-open`; opening focuses the first button/link in the body; `[data-go]` buttons get `.cur` for the current step. Non-sequence: `The Insight panel works with sequence diagrams.`

### Overview card (`Walk.overviewHTML`)
`<h3>title [proposed chip]</h3>`, `N steps, M layers[ in K chapters]. Press → to start, or click any arrow.`, then lines: `**Proposed design.** This flow does not exist in the code yet; it follows the project's own patterns.`, `**Scope:** …`, `**Starts when:** <@trigger>`, flow-level `@summary`, `**Possible endings:** <status chips of flow.endings>` (replies of the main request = first HTTP step or first request; fallback: replies to the first participant), layer pills (`<icon> <b>name</b>`, title = description or `Click to show only its arrows`), extras chips `N side parts` (`data-open="behind"`), `N terms` (`glossary`), `N unconfirmed details` (`errors`).

### Table view columns (`Table.render`)
`#`, `Chapter` (hidden when no chapters), `From → To`, `Sends`, `Does`, `Branch`, `Behind`, `Ref`, `★ Note`. Rows carry `data-step`, `style="--ch:<hue>"`, classes `cur`, `follow`, `findhit`, `chap-start`; cells carry `data-l` labels (`Step`, `Chapter`, `From → To`, `Sends`, `Does`, `Branch`, `Behind`, `Ref`, `Note`) used as stacked labels on phones. Non-sequence: single cell `The table works with sequence diagrams.`

### Code panel: lint display and fix prompt
- `#edStatus`: `<N> steps · Rendered in <ms> ms · Mermaid 12.2.0` (steps part only for sequence diagrams) or `.err` `<b>Line N: Syntax error.</b> <first 4 lines of the message, 300 chars>`.
- `#lintList`: header `<N> note(s) on the annotations`, then `<li><button data-line><span class="ln">line+1</span>message</button>` per lint entry sorted by line; click → `Editor.gotoLine` (selects the line and scrolls). Gutter: `.g-err`, `.g-cur`, `.g-warn`, `.g-ch` (chapter hue stripe on every line of a step: arrow line + its annotation lines). Highlight overlay classes: `.t-tag` (`%% @tag`), `.t-tagtx`, `.t-cm`, `.t-kw`, `.t-ar`, `.t-al`; `.l.cur`, `.l.err`.
- `#codeCount`: `<n> unexplained` (count of lint code `no-step`) or `error`.
- Fix prompt (`App.fixPrompt`, copied to the clipboard; toast `Copied a fix-prompt for <n> unexplained step(s)`):
```
Use the sequence-walkthrough skill in update mode on this Mermaid sequence diagram ("<title>", format walkthrough/2).
Keep every arrow, label and the arrow order exactly as they are. Only add or fix annotations.

Add a %% @step line (what happens and why, 1-2 sentences) directly above these arrows:
- Step <n>, line <line+1>: <FromName → ToName>: <label / label>
            (or, when none are missing: "Every arrow already has a @step.")

Also fix these notes from the viewer:            (only when other lint exists)
- Line <line+1>: <message>

Check it by piping it into validate.py on stdin (don't create a file), then return the full updated code in one ```mermaid block.

```mermaid
<editor text>
```
```
Non-sequence: toast `The fix-prompt works with sequence diagrams`.

## 8. Default diagram, build embedding, debug object

- Default diagram: `skill/sequence-walkthrough/examples/payment-idempotency.mmd` (`@title Payment idempotency`). `build.py` reads it and injects `const SAMPLE = <JSON string, "</" escaped as "<\/">;` plus the `SKILL_KIT` constant immediately after the first `'use strict';` of the joined JS (`core.js, render.js, walk.js, views.js, insight.js, ask.js, export.js, shell.js`, in that order, wrapped in `(() => { … })();`). `SAMPLE` is used at start when there is no fragment code and no autosave, and by the `Load example` button (toast `Loaded the example flow`).
- Page head (`dist/index.html`): `<!doctype html><html lang="en">`, `charset utf-8`, viewport `width=device-width, initial-scale=1, viewport-fit=cover`, `SITE_META` (SVG data-URI favicon: yellow `#ffd43b` rounded square with a `#2a2000` diamond; `theme-color #e9edf2`; `og:type website`, `og:title Sequence Walkthrough`, `og:description Paste Mermaid sequence code and walk through it step by step, one card per arrow.`), `<title>Sequence Walkthrough</title>`, `meta description Paste Mermaid sequence code and walk through it step by step.`, `<style>` (style.css), `<style id="swv-font-css">` (fonts). `dist-claude/sequence-viewer.html` = head styles + body + script only (no doctype/html/head/body tags, no `SITE_META`).
- `document.title`: `Sequence Walkthrough` when the flow title is the default `Sequence diagram`, else `<title> · Sequence Walkthrough`.
- `window.SWV = { S, App, Walk, Camera, Notes, Follow, Find, Spot, Table, Exporter, Codec, Importer, Editor, Renderer, Shell, Chapters, Header, Play, Annotations, buildFlow, mermaidLineToCode, Path, Progress, Presenter, Insight, Glossary, Ask, BehindPop }`. `App.debug` holds `ready` (true after the first render), `lastSave`, `lastPdf`. `S` fields: `code, ann, flow, svg, cleanSvg, svgId, vb, W, H, geo, dom, cur, view ('diagram'|'table'), renderSeq, rendered, error, themeBg, themeDark, settings, codeOpen, hide, noteOpen, playing, enteredFs, chapterLock, insightOpen, lastRenderMs`.

## 9. Responsive breakpoints (`style.css`)

| Width | What changes |
|---|---|
| ≤ 1100 px | `.tb-extra-md` hidden (`#wheelBtn`, `#themeSel`); `#moreBtn` (⋯) shown. With Insight open the top/bottom edge tabs centre over the remaining width. |
| ≤ 720 px (`isNarrow()` = `matchMedia('(max-width: 720px)')`) | all `.tb-extra` hidden (view segment, Find, zoom group, Fit, How it works, Export, `?`); `#flowMeta` hidden; `.cards` becomes `auto 1fr auto` (side cards hidden), nav buttons 36 px, centre card `max-height: 34vh`; `#codePanel`, `#tableView`, `#insightPanel` become `position: fixed; inset: 0` sheets (code z 80, table z 75, insight z 80) with safe-area padding; `#tvClose` ("Back to diagram") shown; table `thead` hidden and rows rendered as blocks with `td[data-l]::before` labels, empty cells hidden; find popover stretches `left/right: 16px`; canvas-control `.lbl` texts hidden (icons only); `.wb-top` wraps and the Follow strip takes a full row (`order: 3`); `.state` and `.gl-add` single column; presenter card 15 px text, full width minus 24 px; `.path-sel` max 150 px. JS: code panel does not auto-focus the textarea; `Camera.insetLeft()` is 0; Esc closes the table view. |

Other CSS facts a rewrite may want: UI theme tokens on `:root` with dark overrides under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`; app grid `auto minmax(0,1fr) auto` with fixed rows so a folded header/step bar leaves its row empty; code panel width `--cp-w: min(480px, 92%)`; Insight width `--in-w: min(520px, 92%)`; centre card default `max-height: min(40vh, 300px)`, side cards `max-height: 150px`; toast 3.2 s / 8 s with an action; z-order: topbar 30, step bar 25, code panel and Insight 20, table 10, find 50, tooltip 45, show-controls 40, popovers 70, modal 90, drop scrim 95, toast and context menu 100.

## 10. Not found in the code

- No separate "chapters" module beyond `Chapters`, `Progress` and `Hl.chapter`; no `Spot`-independent "participant filter" setting is persisted (spotlight resets on reload).
- No consent UI for the Claude provider (see §6); no `window.claude.sample` call.
- `step=N` beyond the step count is clamped by `Walk.go`; a `step` part without a diagram part is honoured against the autosaved/default diagram.
- The README's "Esc or Home shows the overview" is only half right: `Home` goes to step 1; the overview is reached by Esc (end of cascade) or at load.

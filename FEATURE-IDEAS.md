# Feature ideas: understand a whole project from its flows

Goal: the `sequence-walkthrough` skill plus the viewer should let a newcomer understand *everything* about how a project works, one step at a time: which API is called, what is sent, what comes back, which hidden parts (hooks, crons) take part, and what every word means.

## Status (version 2.0, 2026-10-30)

**Built in this version:** everything in section 1 (payload parts, request ↔ reply pairing, reply catalog, status explainer, field provenance, `@uses` strip and Behind drawer, `@trigger`, `@effect`, Ask AI with two modes and a 60-word contract, provider settings for Groq / Gemini / OpenRouter / Cerebras / Mistral / Ollama / custom / Claude artifact, answers saved to the step's note, `@term` glossary with the AI fallback, chapter bands with start and end markers, one colour per chapter everywhere, segmented progress bar, chapter lock, `@summary`), and from section 2: payload diff, `@field` links, `@schema`, `@state`, data touched, branch explorer (happy path / errors / one branch), endings summary, async and resilience chips, error catalog, layer panel, layer kinds with icons, trust boundaries, deep link to a step, presenter mode. Also `@mode proposed`, `@scope`, `@unconfirmed`, and the skill's four modes (Explain, Proposed, Scoped, Easy) with the verify pass and the token budget.

**Still open:** mini-map, request/reply hover arcs on the lifeline, value timeline, code peek and files panel with editor links, quiz mode, progress tracking, study-guide PDF, read aloud, Full ↔ Easy toggle, flow library, flow links, project map, endpoint index across flows, compare two versions, team comments (needs a backend), WebLLM as a no-key provider, framework detection and the endpoint inventory in the skill. **Middleware is always a layer** (its own participant), never a side part.

Legend · 🏷 new tag (spec + skill + validator) · 👁 viewer only · 🤖 skill only · ⚡ quick win

What already exists today, so these ideas build on it: `@title @layer @section @step @payload @ref`, request labels with method + path, reply labels with status code + message, payloads on requests and replies, chapters, Follow a value, Find, participant spotlight, Dim others, table view, notes and bookmarks, autoplay, PDF/PNG/SVG/CSV/MD export, share link, lint + fix-prompt.

---

## 1. Your four ideas, enhanced

### 1.1 Every request and reply fully described
- 🏷 **Structured payload sections.** Keep `@payload` but allow `@payload.headers`, `@payload.query`, `@payload.params`, `@payload.body`, `@payload.cookies`, `@payload.sql`, `@payload.event`. The card shows them as labelled sections or tabs ("Headers · Query · Body") instead of one text block.
- 👁 ⚡ **Request ↔ reply pairing.** The viewer finds the dashed reply that answers a request (reverse direction, same two layers, same block). The request card shows "Answered in step 9: 201 Created"; the reply card shows "Answers step 3: POST /api/v1/payments". A "jump to reply" button on each.
- 👁 **Response catalog per endpoint.** All replies to the same request across `alt` branches collected into one small table on the request card: `201 Created · 409 Conflict · 422 Unprocessable Entity`. Click a row to jump into that branch.
- 🤖 **The description mirrors the data.** Rule for the skill: a reply's `@step` must name the outcome ("Returns 201 with the payment id the browser will poll"); a request's `@step` must name the one input that decides the outcome. New validator hint `step-outcome`.
- 👁 ⚡ **Status-code explainer with no AI.** Hover a status code on a card: a built-in table gives the general meaning ("409 Conflict: the request clashes with current state") and the card text gives the project meaning.
- 🏷 **Same shape for non-HTTP hops.** DB query: statement + reply "1 row / 0 rows". Queue: topic + event body. Self-arrow: `@payload.input` and `@payload.result`.
- 🏷 **Field provenance.** `@field order_id ← step 6` says where each returned value was born. The viewer links the field to that step; Follow a value already finds the occurrences.

### 1.2 Side parts: hooks, crons, middleware and other helpers
- 🏷 **`@uses <kind> <name> [path:line] <text>`.** Kinds: `hook`, `cron`, `middleware`, `listener`, `job`, `worker`, `util`, `config`, `env`, `cache`, `flag`, `migration`, `test`. A side part is anything that runs on the path but is *not* a participant: it has no network, queue or DB boundary of its own.
- 👁 **Per-step strip.** Under the card: "Also involved: 2 hooks · 1 cron", collapsed by default, expandable. Each item shows a kind chip, the name, a one-line role and its `@ref`.
- 👁 **Per-flow drawer "Behind the scenes".** In the bottom bar, grouped by kind; each item lists the steps it acts in. Click a step number to jump. Table view gets a "Behind" column; CSV/MD export include it.
- 🏷 **`@trigger`** on the overview card: how the flow starts (button, cron, webhook, CLI, another flow).
- 🏷 **`@effect`** per step: things that happen after the step and are not arrows (email sent, metric emitted, log line, cache invalidated). Small chips on the card.
- 🤖 **Skill rule.** During the trace, list every file opened that is not a participant and decide: participant, side part, or nothing. At the easy level, middleware folded into the API becomes a side part instead of disappearing.
- Validator: `uses-kind` for an unknown kind, `uses-ref` when built from code but no ref.

### 1.3 Ask a follow-up question on any step
- **Two question modes.**
  - *In this project*: the prompt carries the flow title, chapter, the step's label, `@step`, `@payload`, the two `@layer` texts and the side parts. The answer is about this step.
  - *In general*: only the term ("tombstone"). Short general definition.
- **Answer contract (system prompt).** Under 60 words. Senior-engineer accuracy. Plain words, no jargon without a gloss. One concrete example. If the term is not in the context in project mode, say "not in this diagram" and give the general meaning.
- **UI.** Select a word → "Ask" chip (next to "Follow"). Quick chips on every card: *Explain simpler*, *Why this step?*, *What if it fails?*, *What is <term>?* (auto from followable tokens). Answers appear under the card with *Save to notes* and *Add to glossary*.
- **Model providers.** The viewer is a static page, so there is no server to hide a key. Options:
  - Bring-your-own key (stored in localStorage, sent only to that provider): Groq (Llama), Google AI Studio (Gemini Flash), OpenRouter `:free` models, Cerebras, Mistral. Check each provider's current free tier before relying on it.
  - No key at all: WebLLM runs a small model in the browser via WebGPU (one-time download, offline afterwards), or a local Ollama on localhost.
  - Claude artifact build: the `window.claude` capability answers for every viewer of the artifact without a key.
  - For a shared deployment: a Netlify Function or Cloudflare Worker holds one key and rate-limits per IP, so friends need no key.
- 🏷 **Offline-first glossary `@term <word> <definition>`.** The skill writes a `@term` for every jargon word it uses, taken from the project. The viewer underlines terms and shows the definition on hover. The AI is only the fallback for terms with no `@term`.
- Extras: cache answers per (flow, term); a *Glossary* tab listing all terms and saved answers; a privacy toggle "include payloads in the question"; show the exact text that will be sent.

### 1.4 Chapter highlight on the diagram
- 👁 ⚡ **Chapter band.** A very light translucent rectangle behind all arrows of the active chapter, from the first arrow to the last, in the chapter's own pastel. Other chapters are slightly faded. The current arrow keeps the strong highlight.
- 👁 **One colour per chapter, used everywhere.** Chapter tabs, the band, a stripe in the code editor gutter, the table's chapter rows, the segmented progress bar, the PDF. Fixed palette, light enough to read black text on.
- 👁 **Start and end markers.** A small "▶ Claim the key" tag at the top edge of the band and "■ end" at the bottom, so the chapter's first, middle and last steps are obvious.
- 👁 **Segmented progress bar** under the cards: one segment per chapter, filled as you step. Click a segment to jump.
- 👁 **Chapter-only mode** (key `K`): steps outside the chapter are hidden from navigation; ← → stay inside.
- 🏷 **Chapter summary card** at the first step: `@summary` tag, or auto-generated "5 steps · MW, DB · ends with 201 or 409".
- 👁 **Mini-map** in a corner: the whole diagram shrunk, chapter colours, a viewport rectangle.

---

## 2. More features

### Understanding the data
- 👁 **Payload diff.** Between a request and its reply, or between two steps carrying the same object: added, removed and changed fields highlighted.
- 👁 **Value timeline.** Follow a value, but showing transformations: `cart_77 → pay_456 → ch_789`, using `@field`.
- 🏷 **Schema card `@schema`.** From DTO / zod / joi / pydantic: field, type, rule. Shows which fields can fail validation and which 400/422 that produces.
- 🏷 **State before/after `@state`.** `@state before DB: no row for key 4f9c…` / `@state after DB: row status=running`. Two-column mini state view on the card.
- 👁 **DB touch list.** Tables and columns read or written across the flow, derived from SQL payloads or `@table`.

### Understanding the path
- 👁 **Branch explorer.** `alt` branches as tabs on the card plus a path chooser: *Happy path only* / *All errors* / one branch. Navigation then follows only that path.
- 👁 ⚡ **Endings summary** on the overview card: "4 possible endings: 201, 201 replayed, 409, 422".
- 👁 **Request/reply arcs.** Hovering a request draws a light bracket on the lifeline down to its reply.
- 🏷 **Async and resilience chips.** `@async`, `@retry 3× backoff 1s`, `@timeout 5s`, `@idempotent`. Shown as chips so sync vs async hops are visible.
- 👁 **Error catalog view.** A table of every error reply: status, message, cause, step, branch.

### Understanding the layers
- 👁 **Layer panel.** Every participant with its `@layer` text, step count, chapters it appears in, files from `@ref`, side parts. Click to spotlight.
- 🏷 **Layer kinds.** `@layer FE kind=client …` gives each participant an icon: person, client, edge, service, db, queue, external. The architecture reads at a glance.
- 👁 **Trust boundaries.** Arrows that cross browser→server or server→external get a dotted vertical boundary line, derived from layer kinds.

### Understanding the code
- 👁 **Code peek.** When `@ref` is a GitHub/GitLab URL with line numbers, fetch and show the lines inline (public repos). For local projects, "Open folder" via the File System Access API, then show ±10 lines from the file.
- 👁 **Files panel.** Every file in the flow (from `@ref`) with the steps that touch it, plus `vscode://file/…` links.
- 🤖 **Stack under the step.** route → middleware chain → handler → service → repository, as a small list on the card, from the trace.
- 🏷 **`@unconfirmed`.** Things the skill could not settle from the code, shown as an orange chip on the step instead of only in the chat reply.

### Learning and remembering
- 👁 **Quiz mode.** Hide `@step` and reply labels; guess what happens; reveal. Score per chapter.
- 👁 **Progress.** Mark steps "got it"; resume where you left; the overview shows how much is understood.
- 👁 **Study-guide export.** A PDF of cards, one per step, with payloads, glossary and side parts. An onboarding handout.
- 👁 **Read aloud.** SpeechSynthesis of the card during autoplay.
- 🏷 **Two-level toggle.** If Full and Easy versions both exist (`@level` blocks or two files), switch with one key; the current step is kept by matching the request.

### Many flows, one project
- 👁 **Flow library.** Save many diagrams in the browser, tag them, search across them, "recent flows".
- 🏷 **Flow links `@see <title>#<step>`.** Jump from one flow into another ("Charge the card" → the Refund flow).
- 🤖 **Project map.** The skill writes an index flowchart (entry points → flows) and one walkthrough per flow; the viewer opens the map and drills in.
- 👁 **Endpoint index.** Every `METHOD /path` across all flows with its statuses; click → flow and step.
- 👁 **Compare two versions** of a flow: added, removed and changed steps highlighted; notes follow the unchanged steps.

### Sharing
- 👁 ⚡ **Deep link to a step** (`#step=7`), on top of the existing code-in-URL link.
- 👁 **Presenter mode.** Big card, hidden controls, pointer on the arrow, personal notes as speaker notes.
- **Team comments.** Optional backend (or the Claude artifact database) so notes can be shared, not only personal.

### Skill side
- 🤖 **Endpoint inventory first.** On a big project, list the routes found and ask which flow to draw before tracing.
- 🤖 **Trace report** in the reply: files opened, side parts found, env vars read, not-confirmed list.
- 🤖 **Framework detection.** Express / Nest / FastAPI / Django / Spring / Next.js patterns to find middleware, hooks, crons and listeners reliably.
- 🤖 **Real payload shapes.** Pull examples from tests, fixtures or OpenAPI when present.
- 🤖 **Consistent aliases across a project.** A small layer registry so `FE`, `API`, `DB` mean the same thing in every flow.
- 🤖 **A third level "Deep".** Internal calls inside one layer as self-arrows (controller → service → repository) for people learning the code structure.
- 🏷 **Validator** for every new tag.

---

## 3. Suggested order

| Batch | What | Why first |
|---|---|---|
| 1 · viewer only, no spec change | chapter bands + palette + segmented progress, request↔reply pairing, status-code hover, happy-path filter, deep link to step, endings summary | Visible wins, nothing to re-generate |
| 2 · spec `walkthrough/2` + skill + validator | `@uses` drawer, `@term` glossary, `@trigger`, `@effect`, structured payload sections, `@unconfirmed` | Adds the missing depth to every new diagram |
| 3 · Ask-AI | settings panel, BYO-key providers, WebLLM option, Claude artifact capability, answer cache, glossary tab | Depends on the glossary and card context from batch 2 |
| 4 · many flows | flow library, flow links, project map, endpoint index, code peek, compare | Turns single diagrams into project understanding |

# Sequence Walkthrough 3.0: complete build plan

Status: ready to build. Written on 2026-10-30. Nothing here has been built yet.
This one file replaces every earlier version of the plan. All decisions are made.

## 0. Start here

To begin, open a new Claude Code session in `D:\Full Stack Albetrios\TR\flow-diagram` and paste this:

```text
Build the project by following IMPLEMENTATION-PLAN.md exactly, phase by phase, until section 12 is fully met.
Read sections 0 to 5 now, and each later section only when its phase needs it.
Do not ask me anything. Follow section 1 and section 2. Report only when everything is merged.
```

**Before you paste it:** set the session's permission mode so tools can run without prompts. Claude cannot change that setting itself, and it decides whether you see permission pop-ups.

### Where things stand

| Item | State |
|---|---|
| GitHub repo | `rudra-tank-albetrios/sequence-walkthrough`, public, default branch `main` |
| Starting commit | `398d08e` or newer on `origin/main` |
| Live site | `https://rudra-tank-albetrios.github.io/sequence-walkthrough/` (GitHub Pages) |
| Local tools confirmed | Node 24, npm 11, Python 3.14, GitHub CLI logged in |
| Current app | About 3,800 lines of plain JavaScript in `src/js`, joined by `build.py`, loading Mermaid and jsPDF from a CDN |
| Uncommitted local work | Never to be committed (section 1). Read it only as reference. |

## 1. Working rules for the whole build

These rules apply to every phase and do not need repeating.

### Git

1. **Never commit the current local state.** Leave `D:\Full Stack Albetrios\TR\flow-diagram` as it is, and treat it as read-only reference.
2. **Work from GitHub's version.** Create a separate working folder:

   ```bash
   git fetch origin
   git worktree add "../flow-diagram-build" -b chore/foundation origin/main
   ```

3. Copy this plan to `docs/IMPLEMENTATION-PLAN.md` in the first branch. Never commit `.serena/`, and add it to `.gitignore`.
4. **One branch and one pull request per phase.** Each new branch starts from the latest `origin/main`. Never push straight to `main`.
5. A phase's pull request is created only after section 9's local checks all pass.
6. **Approval step:** GitHub does not let an account approve its own pull request. So approval means a code review with `/code-review high`, fixing every confirmed finding, then all required checks passing. Do not create a second account or a bot to get around this.
7. Merge with a merge commit, then delete the branch.
8. After each merge, check the live site with the smoke test. If it is broken, revert the merge at once, then fix it on a new branch.

### Decisions

- **Ask the user nothing until everything is built and merged.** Choose the best option using section 2 and section 3.
- Prefer the secure, simple and well-tested option, even when it is harder to build.
- Record each decision that is not in this plan in `docs/decisions.md`, in one or two lines.
- If something cannot be done, such as a live check that needs the user's API key, test it with a mock, finish everything else, and list it in the final report.
- Never fake a pass, skip a failing check or weaken a test to get a merge.

### Free services only

No paid service, paid plan or trial may be used. If a service is not free, use the alternative below or find another free one.

| Need | Use | Alternative if unavailable |
|---|---|---|
| Hosting | GitHub Pages | Cloudflare Pages free plan, Netlify free plan |
| CI | GitHub Actions (free for public repos) | None needed |
| Security scanning | CodeQL, Dependabot, Gitleaks, `npm audit` | Semgrep Community Edition |
| AI models | The user's own key: Groq, Gemini, OpenRouter, Cerebras, Mistral free tiers | Ollama on the user's computer |
| Voice | Browser speech (Web Speech API) | None. The feature hides if unsupported. |
| Testing | Vitest, Testing Library, Playwright, axe-core, MSW | None needed |
| Icons and fonts | Lucide icons, existing Recursive font | Any free open-source set |

Project keys must never be needed. Tests use mocks and no real API key.

## 2. Decisions already made

| # | Topic | Decision |
|---|---|---|
| 1 | Front end | Convert completely to TypeScript, React and Vite. Remove `src/js` and `build.py` once everything matches. |
| 2 | Server | No Node or Fastify server unless the check in Phase 5 proves one is needed. If so, build only the small relay in section 8.13. |
| 3 | Database | None. Browser storage only. |
| 4 | Package manager | npm workspaces, as npm is already installed |
| 5 | Styling | CSS Modules with shared design tokens |
| 6 | State | Zustand for shared state, React state for local state |
| 7 | Dialogs and menus | Radix UI primitives, for accessibility |
| 8 | Browser storage | IndexedDB (`idb-keyval`) for cache, quiz and weak points. Keep existing `swv:` localStorage keys readable, so notes and bookmarks survive. |
| 9 | Validation of AI replies | Zod schemas |
| 10 | Skill names | `seq-diagram` and `detailed-seq-diagram` |
| 11 | Redis, Event Bus, queues, workers | Drawn after the main layers, only when the flow really crosses them. Background work gets its own chapter. |
| 12 | Crons, hooks, utils and similar | Bottom bar and hover. A cron that starts the flow is drawn first. |
| 13 | Function and middleware names | Kept in arrow labels |
| 14 | Error replies | Kept in short form, with status and message |
| 15 | "Not confirmed" and file links | Kept. Links on calls and replies to the client only. |
| 16 | Code too large for chat | Over about 50 KB, write one `<flow-name>.seq.md` in the project. Otherwise always chat. |
| 17 | Speed | About 60 to 75 seconds for a small flow is the goal, with no hard diagram size cap |
| 18 | "Model link" | An OpenAI-compatible endpoint URL plus a model name |
| 19 | "Blurred to 75%" | Strong blur plus a 75% dim layer behind the overlay |
| 20 | Voice default | On when Play is first pressed, then the choice is remembered |
| 21 | Quiz time default | Stopwatch |
| 22 | Quiz with no model | Works only on the demo flow, using a built-in sample quiz. Other flows open AI settings. |
| 23 | Threats in `seq-diagram` | One short `@threat` line, only for something seen in the code |
| 24 | Licence | MIT, as the repo is public and has no licence today |
| 25 | Python validator | Replaced by one TypeScript validator, compiled into the skills (section 7.4) |

## 3. Project structure

```text
.
├── apps/
│   └── web/                     React app
│       └── src/
│           ├── app/             Start-up, providers, layout
│           ├── features/        viewer, walkthrough, table, code-panel, insight, export,
│           │                    ask-ai, models, quiz, recap, voice, review, tour, settings
│           ├── shared/          ui, hooks, storage, tokens (no feature logic)
│           └── main.tsx
├── packages/
│   ├── core/                    Parser, flow model, lint, review rules. No browser or React code.
│   └── ai/                      Model clients, usage, auto-switch, cache, prompts, schemas
├── skills/
│   ├── shared/                  Rules used by both skills (one copy only)
│   ├── seq-diagram/             Fast skill
│   └── detailed-seq-diagram/    Detailed skill
├── examples/
│   └── demo-store/              Small real backend and frontend behind the demo flow
├── tools/                       build-skills, check-refs, check-budgets
├── docs/                        ARCHITECTURE, decisions, implementation plan
├── e2e/                         Playwright tests
├── .github/                     CI, deploy, CodeQL, Dependabot
├── README.md  CONTRIBUTING.md  SECURITY.md  LICENSE
└── package.json                 npm workspaces
```

### Rules that keep it clean

- **Each piece of logic lives in one place.** Parsing and lint only in `packages/core`, model calls only in `packages/ai`, skill rules only in `skills/shared`.
- **Dependency direction:** `apps/web` may use `packages/*`. `packages/ai` may use `packages/core`. `packages/core` depends on nothing here.
- Features do not import from each other. Shared code moves to `shared/`.
- Files stay small and focused, ideally under 300 lines. Strict TypeScript is on, and `any` is not allowed.
- CI enforces this with `dependency-cruiser` (boundaries), `jscpd` (duplication under 2%) and `knip` (unused code).

## 4. Security rules

| Risk | Rule |
|---|---|
| API keys | Stay in this browser and go only to that model's URL. Never in logs, URLs, exports, the cache or bug reports. Offer "Forget key when this tab closes". |
| Fake protection | Do not encrypt keys with a key stored beside them. It adds no safety. Tell users plainly that the key is stored in this browser. |
| Pasted diagrams and URL-shared code | Treat as untrusted. Mermaid stays at `securityLevel: 'strict'`, and SVG goes through DOMPurify. |
| AI replies | Treat as untrusted data. Show as plain text, validate with Zod, and never let them run an action. |
| Prompt injection | Flow text is clearly marked as data in prompts. Quiz, recap and review output can only display things. |
| `dangerouslySetInnerHTML` | Allowed only in one sanitised diagram component. An ESLint rule blocks all other uses. |
| Custom model links | `https` only, except `localhost`. A key is never sent to a different URL than it was saved for. |
| Page security | A Content Security Policy with no external scripts. Scripts are bundled, not loaded from a CDN. |
| Third-party code | Lockfile committed, `npm ci` in CI, Dependabot on, GitHub Actions pinned to commit SHAs, least permissions |
| Secrets in the repo | Gitleaks on every pull request |
| Privacy | Before the first AI feature, say what text goes to which provider. Auto-switch only uses models the user marked as fallbacks. |

## 5. Speed and token budgets

CI fails if a measured budget is broken. Numbers marked "goal" are checked by hand at release.

### Skills

| Item | Budget |
|---|---|
| `seq-diagram` `SKILL.md` | At most 8 KB |
| `detailed-seq-diagram` `SKILL.md` | At most 15 KB, with references read only when needed |
| Normal diagram from `seq-diagram` | About 8 KB of code (goal) |
| Small flow time | 60 to 75 seconds (goal, 73 seconds was the last measure) |

### AI features

| Item | Budget |
|---|---|
| Flow summary sent to a model | At most about 1,500 tokens, and never the full diagram code |
| Ask AI reply | At most 220 tokens, as today |
| Quiz of 5 questions | At most about 1,200 reply tokens |
| Marking a one-line answer | At most 80 reply tokens, in one batch per quiz |
| Day recap | At most about 500 reply tokens, saved until new mistakes appear |
| Repeated question | 0 tokens, from the answer cache |

Multiple choice is marked in the browser, using no tokens. The structure score uses browser rules, also no tokens.

### Web app

| Item | Budget |
|---|---|
| First-load JavaScript, without Mermaid | At most 200 KB gzipped |
| Mermaid, PDF and quiz code | Loaded only when needed in the hosted site |
| One-file build for the Claude artifact | Under 16 MB |
| Moving between steps | No visible delay on a 100-step flow |

### While building

To keep this build itself cheap:

- Read only the plan section for the current phase, and only the old files that phase needs.
- Search first, then read line ranges. Never read a file twice.
- Do not print long test output. Show only failures.
- Do not write speculative features or extra abstractions.

## 6. Build phases

Each phase is one pull request, and `main` must keep working after each one.

| Phase | Branch | Work | Section |
|---|---|---|---|
| 1 | `chore/foundation` | npm workspaces, TypeScript, lint, tests, CI, security scans, LICENSE, plan copy. Old app still deployed. | 3, 4, 9 |
| 2 | `feat/core-package` | Demo store, golden tests from the old parser, then parser and lint in `packages/core` | 7.1, 8.12 |
| 3 | `feat/react-viewer` | React app matching every existing feature, in `apps/web`, alongside the old app | 7.2 |
| 4 | `chore/cutover` | Switch hosting to the new app, remove `src/js`, `build.py` and old deploy steps | 7.3 |
| 5 | `feat/skills` | Two new skills, shared rules, one validator, install in both Claude apps | 7.4 to 7.7 |
| 6 | `feat/models` | Check provider browser access, then model list, usage bar, auto-switch, answer cache | 8.1 to 8.4 |
| 7 | `feat/new-design` | Clean page, tool groups, overlay, header, Flow Rail and bottom dock, including side parts | 8.5 to 8.7 |
| 8 | `feat/voice` | Spoken explanation on Play | 8.8 |
| 9 | `feat/quiz` | Quiz, timer, stopwatch, results, weak points, downloads | 8.9 |
| 10 | `feat/recap` | Quick day recap | 8.10 |
| 11 | `feat/review` | Structure rating, confidence, threats, `@threat` tag | 8.11 |
| 12 | `feat/demo-tour` | Finish the demo, feature tour, docs, final checks, release `v3.0.0` | 8.12, 12 |

A relay is added only if Phase 6's check requires it (section 8.13).

## 7. Migration and skills

### 7.1 Core package

1. Before changing anything, run the old `core.js` in Node on every example and save its parsed output as golden files.
2. Move `Annotations`, `buildFlow`, parsing helpers and lint into `packages/core` as strict TypeScript.
3. The new parser must match the golden files exactly, and any difference must be a recorded bug fix.
4. Keep the `walkthrough/1` and `walkthrough/2` formats working.

### 7.2 Feature parity checklist

Create `docs/parity.md` by going through `README.md` and the old `src/js` files. Each item needs a Playwright test before Phase 4. It includes at least:

| Area | Features |
|---|---|
| Diagram | Render, pan, zoom, fit, sticky participant header, click participant to filter, find |
| Walkthrough | Step cards, play and timer, dim others, chapter bands, path filter, keyboard keys, overview card, hide |
| Step details | Payload parts, request and reply pairing, status explainer, follow a value, glossary, `@uses` details, code links |
| Views | Table view, Insight's six tabs, code panel with lint and fix-prompt |
| Personal data | Notes, bookmarks, saved AI answers, settings. Old data must load unchanged. |
| Sharing and files | Code-in-URL link, paste and Markdown import, all exports, multi-page PDF |
| AI | Ask AI with all current providers, Claude artifact mode |
| Other | Non-sequence diagrams, skill kit download, themes, phone layout |

Compare old and new with Playwright screenshots on the same flow. Small visual differences are fine, but missing features are not.

### 7.3 Cutover

Deploy the new app only after every parity test passes. Then remove `src/`, `build.py`, `dist-claude` handling and Python from CI. Keep the same public URL. Update `netlify.toml` to the new build. Produce both the hosted build and a one-file build with `vite-plugin-singlefile`.

### 7.4 One source for the skills

- `tools/build-skills` joins `skills/shared` into each skill and creates one zip per skill, plus the skill kit.
- Each generated skill is self-contained.
- The validator is written once in `packages/core`, then bundled to `scripts/validate.mjs` in the detailed skill. Delete `validate.py`.
- First confirm Node runs in the Claude app's skill environment. If it does not, keep a small generated Python copy, and test both against the same fixture files, so they cannot drift.
- Each description is at most 1024 characters. The build stops if longer.

### 7.5 Skill names and triggers

| Skill | Purpose | Triggered by |
|---|---|---|
| `seq-diagram` | Fast everyday flow | "diagram this flow", "how does X work", "walk me through" |
| `detailed-seq-diagram` | Every detail, validated, slower | "detailed seq diagram", "detailed flow", "full detail" |

Remove "Full detail" mode from `seq-diagram`. Neither description may match the other's trigger phrases.

### 7.6 Rules for both skills

**Layers come from the project, never a fixed search.**

1. Look at the folder structure, and map folders to layers by what they do.
2. Default backend order, when those parts exist:

   ```text
   Frontend → App → Routes → Middleware → Validator → Controller → Service → Repository → Database → Serializer → DTO
   ```

3. Different structures get their own layers: Next.js API routes, NestJS modules, Django apps, Laravel, feature folders.
4. **Frontend layers come from its real folders and main parts**, such as Pages → Components → Store → API Client.
5. Each layer appears once, with the same name and order in all of a project's diagrams. Two services are one Service layer, and labels name the class.
6. Draw only the layers the flow uses, and never search for a folder that is not there.
7. Redis, Event Bus, queues and workers follow the main layers when crossed.
8. Crons, hooks, utils, helpers, config, env values, constants and libraries are `@uses` side parts.

**Reading, with the fewest tokens:**

1. List top-level folders once.
2. Find the entry point with one search.
3. If a README or reference file covers that folder or file, read it first.
4. If it answers with confidence, use it. If it is missing, unclear or looks older than the code, read only the needed code lines.
5. Read each file once. Never read tests, unrelated docs or files off the path.
6. A file link may point only to code that was really opened. Nothing is guessed. Anything unconfirmed gets `@unconfirmed`.

**Output:**

- Chat only, in one `mermaid` block, except the over-50-KB case in section 2.
- No artifact, canvas or other file type, and no extra steps.

### 7.7 What each skill includes

| Item | `seq-diagram` | `detailed-seq-diagram` |
|---|---|---|
| Layers in fixed order, each once | Yes | Yes |
| Numbered arrows (`autonumber`) | Yes | Yes |
| What goes | Field names | Full payloads with fake example values |
| What comes back | Yes, when a real value returns | Every return |
| Method and path | Yes | Yes |
| Status code and message | Yes | Yes, with error bodies |
| Function and middleware names | Yes | Yes |
| Background work | Yes | Yes |
| One short line on each arrow | One sentence | 1 to 2 sentences |
| Chapters of related steps | Yes, grouped by purpose, never by layer or count | Yes |
| Side parts | When they act | All |
| Code links | On calls and client replies | Every step |
| `@threat`, "Not confirmed" | Yes | Yes |
| Schemas, state, retries, timeouts | Only when the flow is about them | Yes |
| Validator and re-checking every link | No, as the viewer checks on paste | Yes |

Then install them:

1. Claude Code: copy both to `~/.claude/skills`, and move the old `sequence-walkthrough` and `detailed-seqflow` folders to `~/.claude/skill-backups`.
2. Claude app: use Customize → Skills. Upload `seq-diagram` and `detailed-seq-diagram`, replacing or removing the old two.
3. Confirm each trigger phrase loads only the right skill.
4. Time one run on `examples/demo-store` and record it in `docs/decisions.md`.

## 8. Feature specifications

### 8.1 Model list

Today the viewer has fixed providers and one custom endpoint. Replace this with a saved, ordered list. Each entry has:

- a name
- a preset or an OpenAI-compatible endpoint URL
- a model name
- the user's own API key
- optional limits
- a "use as fallback" choice

Old saved keys move over automatically. The Test button checks each entry and explains a blocked browser call clearly.

**Check first (no key needed):** send a browser-style request to each preset, and record whether it allows browser calls and exposes rate-limit headers. Save the results in `docs/decisions.md`.

### 8.2 Usage bar

One bar per model, beside Ask AI and in settings. Green under 60% used, amber from 60% to 85%, red above 85%. The percentage and remaining amount always appear as text. Hover shows limit and reset time.

| Source | Method | Label |
|---|---|---|
| Groq, Cerebras and others exposing rate-limit headers | `x-ratelimit-*` headers | Exact |
| OpenRouter | Its key information endpoint | Exact |
| Providers with no data, or with blocked headers | Browser count against user-entered limits | Estimated, this browser only |
| No data and no limit | Requests made today | Count only |

### 8.3 Auto-switch

| Trigger | Action |
|---|---|
| Remaining usage at or below 5% (editable) | Next question uses the next model |
| 429 or quota error | Retry once on the next model |
| Bad key error | Do not switch. Show the error on that model. |
| Network error or 5xx | Try the next model once |
| All used up | Clear message with the earliest reset time |

A short notice says what happened, such as "Groq limit reached, switched to Gemini". The first model returns after its reset. One request tries each model at most once, so it can never loop. Only models marked as fallbacks are used, and each receives only its own key.

### 8.4 Answer cache

- **Same answer when:** flow version, step, normalised question and answer mode all match.
- **Different model:** reuses the saved answer and shows which model wrote it.
- **On screen:** "Saved answer" label and an "Ask again" button.
- **Changed flow:** answers for changed steps are not reused.
- **Limit:** newest 500 answers. Size is shown in settings, with a clear button.

### 8.5 Clean main page and tool groups

| Area | Contents |
|---|---|
| Header | Logo, flow title, Diagram and Table switch, Find, Learn, Analyze, Export, Settings |
| Centre | Diagram and current step card, with Ask AI on the card |
| Bottom | Play, voice, speed, Flow Rail, chapters |

| Group | Moved here |
|---|---|
| Learn | Quiz, day recap, weak points, glossary, voice settings |
| Analyze | Structure review, threats, layers, endpoints, errors, data, side parts |
| Export | Image, PDF, Markdown, Mermaid, quiz, quiz with flow |
| Settings | Theme, models, keys, usage, cache, stored data |

### 8.6 Overlay

- 85% of page width and height, centred, with space on all four sides.
- The earlier page stays visible around it, with a strong blur and 75% dim. The overlay stays sharp.
- Closes with the close button, Esc or an outside click. A running quiz asks first.
- The same flow, step and zoom return afterwards.
- Focus stays inside it and returns to the opening button.
- Nearly full screen on phones.

### 8.7 Header, Flow Rail and bottom dock

- **Header:** slim, glass-like, with a clear brand, flow title, step count and grouped tools.
- **Bottom dock:** floating, with a large central Play button.
- **Flow Rail, the signature element:** a progress line split into chapter colours, with markers for errors, side parts, threats and bookmarks. Hover previews a step, and clicking jumps there.
- **Side parts:** crons, hooks, utils and others appear as rail markers plus a compact list by kind. Those used on the current step are highlighted. A small dot on the arrow shows the same details on hover: name, purpose, file and line, and steps used.
- Short, smooth motion, off for users who prefer reduced motion.
- Works in both themes, at phone width and by keyboard, with good contrast.

Design it with the `design-taste-frontend` skill, and avoid a generic template look.

### 8.8 Voice

| Part | Rule |
|---|---|
| Start | Starts when Play is pressed |
| Content | Reads each step's plain explanation. Paths and code become simple words. |
| Timing | The next step waits for the voice to finish |
| Mute icon | One speaker icon beside Play. It controls only the voice. The flow keeps playing when muted. |
| Pause and skip | Pause also pauses speech. Skipping stops old speech and reads the new step. |
| Speed | 0.5x to 2x, default 1x, remembered |
| Voice choice | Clearest installed voice by default, and changeable |
| Unsupported | Icon is hidden |

Voice quality depends on each device, so state this in settings.

### 8.9 Quiz

**Set-up:** difficulty, 5, 10 or 15 questions, question mix and time mode.

| Difficulty | Focus |
|---|---|
| Easy | Layer order, who calls whom, method and path, status codes |
| Medium | What goes, what comes back, what each chapter does, why a step exists |
| Hard | What happens on failure, what the user receives, why the order matters |

**Types:** multiple choice, one-line answer, short theory, or Mix.

**Questions come only from the flow on screen:**

- Each question must name its source step.
- A question is rejected if the step is missing or the answer is unsupported. The app retries once, then shows a clear error.
- Recent questions are sent as "do not repeat", and weak topics are asked more often.

**Time:**

- Off.
- Timer: 5, 10, 15 minutes or custom. It warns near the end and submits at zero.
- Stopwatch: counts up and stops on submit.

**Result, shown immediately after submit:**

- Score, time, and scores per chapter and difficulty.
- Each question with the user's answer, correct answer, reason and a link to its step.
- Weak points found.

Multiple choice is marked in the browser. Written answers are marked by the model as correct, partly correct or wrong, in one batch. These are labelled "AI marked" and have a "Mark as correct" option.

**Weak points**, in browser storage: flow, step, chapter, topic, question, user's answer, correct answer, date and times missed. Correct answers later lower the count. The list can be viewed, exported and cleared, and the screen explains that clearing browser data removes it.

**Downloads:**

| Download | Contents | Formats |
|---|---|---|
| Quiz | Questions, with or without answers | Markdown, PDF |
| Result | Questions, answers, score, time, feedback | Markdown, PDF |
| Quiz with flow | The above plus the diagram image and Mermaid code | PDF, Markdown |

### 8.10 Quick day recap

- **Period:** today, last 7 days or all time, for the current flow or all flows.
- **Each mistake:** question, user's answer, why it was wrong and correct answer.
- **Analysis:** the user's model groups mistakes and writes short key points.
- **Practice:** "Retry my mistakes" starts a quiz on those topics.
- **Saved** until new mistakes appear.
- **With no model:** mistakes and correct answers still appear, without analysis.

### 8.11 Structure review and threats

Two separate results appear in the Analyze overlay:

- **Structure rating, 0 to 100:** how well this flow follows its layers.
- **Confidence, low, medium or high:** how much evidence supports the rating.

| Area | Example checks |
|---|---|
| Layers | Controller or route reaches the database directly, layer skipped, layer doing another's work |
| Validation | Request with a body has no validator step |
| Access | Write or private route has no auth step |
| Replies | Call has no reply, error has no status, or response skips an existing serializer |
| Reliability | Outside call has no failure path, or data can be left half saved |
| Data exposure | Passwords, tokens or secrets in a URL, log, payload or queue |

**Build order:**

1. Browser rules in `packages/core` give the score, using no tokens and the same result every time. Rules are listed on screen.
2. The user's model explains the findings in plain words, but cannot change the score.
3. New tag: `%% @threat <high|medium|low> <short text>`, added to the parser, lint, viewer and both skills. Threats also appear on their step and on the Flow Rail.
4. Confidence rises with steps linked to code and with more flows reviewed. It falls with unconfirmed details and diagrams made without code.

**Honest limits, shown on screen:**

- The label says "This flow", as one flow cannot rate a whole project.
- A threat means "possible problem, please check".
- This is not a security audit, and a clean result does not mean a project is safe.

### 8.12 The demo: one example showing every feature

`examples/demo-store` is a small real project, so a new person sees true behaviour. Its code links can be verified automatically.

**Contents:**

- Frontend: Pages, Components, Store, API Client.
- Backend: App, Routes, Middleware, Validator, Controller, Service, Repository, Serializer, DTO.
- In-memory stand-ins for the database, Redis, queue and mail, so it runs with no setup or paid service.
- Its own test suite, run in CI.

**Default flow, "Place an order", shown when the viewer opens:**

| Feature | How the demo shows it |
|---|---|
| Layers and numbering | Every main layer, each once, with numbered arrows |
| What goes and what comes back | Payloads and returned values |
| Replies | Success, 401, 409 and 422 |
| Background work | Event, queue, worker, then the confirmation email, in its own chapter |
| Side parts | A cron, hook, util and config value on the rail and on hover |
| Chapters | Check the request, Reserve stock, Save the order, Reply, Send the email |
| Threat | One clearly labelled sample threat, plus an honest confidence result |
| Quiz and recap | Built-in sample quiz and recap, so they work with no API key |
| Usage bar | Simulated data in the tour only, labelled "Demo" |

**Guided tour:** a "Take the tour" button walks through the layers, voice, Flow Rail, side parts, Ask AI, usage and auto-switch, quiz, recap, review and exports. It can be skipped, and runs once for first-time visitors.

`tools/check-refs` fails CI if any code link in the demo flow points to a missing file or line.

### 8.13 Optional Fastify relay

Build this only if Phase 6 finds that a preset's browser calls are blocked and no free alternative works. Otherwise leave it out and record the reason.

If built, it is `apps/relay`, with Node and Fastify, run locally by the user, with no accounts or database:

- A fixed allowlist of provider hosts, which blocks private and internal addresses.
- Passes the key through without storing or logging it. Authorization headers are redacted.
- Request size limits, timeouts and a rate limit, listening on `localhost` only by default.
- The viewer keeps working without it.

## 9. Checks before every pull request

Add one command, `npm run verify`, that must pass locally and in CI:

| Check | Tool |
|---|---|
| Format and lint | Prettier, ESLint |
| Types | `tsc --noEmit`, strict |
| Unit and component tests | Vitest, Testing Library |
| Browser tests | Playwright on Chromium, Firefox and WebKit |
| Accessibility | axe-core on the main screens |
| Build | Hosted and one-file builds, plus the skill zips |
| Boundaries, duplication, unused code | dependency-cruiser, jscpd, knip |
| Budgets | `tools/check-budgets` |
| Demo code links | `tools/check-refs` |
| Security | `npm audit --audit-level=high`, Gitleaks |

Then also:

1. Run the built site, and check the browser console has no errors.
2. Take a screenshot of each changed screen, in light and dark themes and at phone width.
3. Run `/code-review high`, and fix every confirmed finding.
4. Open the pull request with what changed and how it was tested.
5. Wait for CI to pass.
6. Merge, and run the smoke test on the live site.

Set GitHub branch protection on `main` to require these checks. No required approval, as GitHub blocks self-approval (section 1).

## 10. Feature test list

| Area | Must be proven |
|---|---|
| Parser | Matches golden files, and old formats still work |
| Old user data | Notes, bookmarks and keys from version 2 load correctly |
| Skills | Each trigger loads the right skill. Layers match Express, NestJS or Next.js, Django and feature-folder samples. |
| Reading | No file read twice, and a good README reduces code reads |
| Accuracy | Paths, statuses and fields match the code |
| Models | Add, test, edit, reorder and delete. Each key goes only to its own URL, confirmed from the network log. |
| Usage bar | Colours at set limits, with correct Exact and Estimated labels |
| Auto-switch | Low usage, 429, bad key, network error and all used up, with no loops |
| Cache | Repeated question makes no network call, "Ask again" does, a changed flow does not reuse |
| Overlay | 85% size, blurred background, sharp overlay, state restored |
| Voice | Starts on Play. Mute silences only voice. Pause, skip and speed work. |
| Quiz | All levels and types, every question linked to a real step, bad AI replies handled |
| Timer | Auto-submit at zero, correct stopwatch time, no double submit |
| Weak points and recap | Saved after reload, reduced by correct answers, correct by period, works with no model |
| Exports | Each download opens and has the correct contents |
| Review | Known problems are found, and a clean sample has no false threat |
| Security | Malicious diagram text and AI replies do not run scripts |
| Demo | Works with no key, and the tour reaches every feature |
| Design | Light, dark, phone, keyboard, reduced motion, contrast |

## 11. Not in this version

Accounts, a database, team sharing, paid services, a VS Code extension, GitHub integration and a project workspace are left for later. `FEATURE-IDEAS.md` keeps those ideas.

## 12. Finished means

All of these must be true before the final report:

1. Phases 1 to 12 are merged into `main`, with no open build branches.
2. `npm run verify` and CI pass on `main`.
3. The live site works, and opens the demo flow and tour.
4. Every item in `docs/parity.md` and section 10 passes.
5. `seq-diagram` and `detailed-seq-diagram` work in Claude Code and the Claude app, and the old names are gone.
6. The README lets a new person run the project, use the demo and understand each feature. `CONTRIBUTING.md`, `SECURITY.md` and `docs/ARCHITECTURE.md` are written.
7. Tag and release `v3.0.0`.

The final report lists what was built, the live link, test results, measured skill time and anything that could not be tested without a real API key. Do not claim anything that was not proven.

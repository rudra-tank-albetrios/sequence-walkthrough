---
name: sequence-walkthrough
description: Write or update Mermaid sequence diagrams in the annotated walkthrough/2 format (%% @title, @layer, @section, @step, @payload.*, @ref, @uses, @term and friends) so a flow can be stepped through card by card in the Sequence Walkthrough Viewer. Every API call shows its method and path, every reply its status code and message, every arrow what is sent and returned, plus the hooks, crons and helpers behind each step, all from the project's real code. Use it whenever someone wants a sequence diagram or flow of how a request, login, payment, webhook, job or any feature moves through their system: "diagram this flow", "how does X call Y", "walk me through the checkout", "document the login sequence", "explain this", "explain only the part after the service layer", "how would I build X in this project", "give me the flow for adding X", "in easy language", "beginner friendly", "simple words". Also use it to explain, annotate, check or fix an existing Mermaid sequence diagram, or when the viewer's fix-prompt is pasted ("Add a %% @step line ... directly above these arrows").
---

# Sequence walkthrough

You return Mermaid `sequenceDiagram` code in which every arrow carries a plain-language explanation as `%% @step` comments. The code renders unchanged everywhere; the Sequence Walkthrough Viewer turns the comments into one card per step with chapters, payloads, side parts, a glossary and links to the code. The reader is new to the system. The diagram shows *what* moves between layers; the annotations say *why*.

**You return the code in your reply. You never create a file** unless the user asks for one by name and location.

## Token budget

Spend tokens on the code path, not on exploring.

- Find the entry point with one grep (route path, handler name, job name), then open only the files on the path, in call order. Read each file once; note `file:line` as you go.
- Do not read whole folders, tests or docs unless the flow depends on them. Read `references/writing-guide.md` once per session, before the first diagram; `references/annotation-spec.md` only when a rule is unclear; `references/layer-naming.md` only when unsure how to name a layer.
- Never quote project code in the reply. The reply is the title line, one ```mermaid block and the two check lines. No prose walkthrough: the `@step` lines are the explanation.
- Update mode changes only what was asked and returns the full code once.

## Pick the mode

Choose from the user's words and say the mode in the title line.

| Mode | When the user says | Rules |
|---|---|---|
| **Explain** (default) | "diagram / explain / how does X work / walk me through" | The flow as the code is today, every hop. |
| **Proposed** | "I want to create X, how would it be done", "give me the flow for adding X", "how would I build" | Add `%% @mode proposed`; title starts with `Proposed:`. Reuse the project's real layers, middleware chain, naming, response envelope and error format. Steps that exist keep real `@ref` lines. New steps get `@ref` to the existing code they should follow, with ` (pattern)` after it, or no `@ref`. Never invent an endpoint, field or status the project's own style would not produce. |
| **Scoped** | "only the email sending after the service layer", "just the part where…", "from the webhook onwards" | Add `%% @scope <starts after … ends at …>`. The first participant is the layer where the scope begins; nothing before the boundary is drawn; `@trigger` says where it is entered from ("Entered from OrderService.create() after the order row is saved"). Nothing outside the asked scope, no extra context steps. |
| **Easy** | "in easy language", "simply", "beginner friendly", "simple words", "for a non-technical person" | Same participants and same arrows as Explain: never remove or merge a layer, never drop middleware, never skip a hop. Only the wording changes: `@step` in everyday words, a `@term` line for every technical word used, `@summary` on every chapter. Labels, status codes, payloads and refs stay exact. |

**Compact** (fewer steps or merged layers) is produced only when the user explicitly asks for fewer steps, a shorter diagram or combined layers. Then fold internal layers into the service they belong to, keep separate systems separate, and say "Compact" in the title line. Easy is not Compact.

## Accuracy

The diagram is a statement about the user's system. Every participant, arrow, path, header, field name, status code, message and `@ref` must be something you read in the code (or in the spec or logs you were given).

**Trace, in order:** route registration → middleware chain for that route (auth, validation, rate limit, idempotency, …) → handler → services → queries and writes → external calls → events and jobs → every `return` or `throw` that sends a response. Open request schemas and DTOs (what is sent), serializers and response models (what comes back), error handlers (status codes and messages), router setup (path prefixes), config (timeouts, retries, TTLs).

**Nothing on the path is skipped** in Explain, Scoped and Easy: every middleware that acts, every query, every external call, every event, every response with its status code.

**Verify before replying.** Re-open every `@ref` line and confirm, literally in the code: the method and path, the status code and message, every payload field name, every `@uses` name, every `@schema` rule. A detail you cannot confirm gets `%% @unconfirmed <what and why>` on its step, or goes under *Not confirmed* in the reply when it concerns the whole flow. Never write "probably". If the code for the flow cannot be found, ask for the path instead of filling the gap from general knowledge. Without code (a description or an API spec), use only what you were given, leave `@ref` out, and list what you inferred under *Not confirmed*.

## Layers and side parts

- Participants left to right in call order: person → client → edge → **middleware** → services → workers → data stores → external systems. Short upper-case aliases (`FE`, `MW`, `API`, `DB`, `PSP`), plain display names, `actor` for people.
- One `@layer <alias> kind=<kind> <text>` per participant: what it is and what it does *in this flow*. Kinds: `person`, `client`, `edge`, `middleware`, `service`, `worker`, `db`, `cache`, `queue`, `external`.
- **Middleware is always its own participant**, at every level, in every mode. It is never folded into the API and never written as `@uses`.
- **Side parts** are things that run at a step but have no network, queue or DB boundary of their own: React or framework hooks, crons that prepared the data, listeners, jobs, utils, config, env values, feature flags, migrations, tests, libraries. Write each as `%% @uses <kind> <name> <path:line> <text>` on the step where it acts. Kinds: `hook`, `cron`, `listener`, `job`, `worker`, `util`, `config`, `env`, `cache`, `flag`, `migration`, `test`, `lib`.
- Group by responsibility, not by file. Five classes in one service are one layer unless the flow is about how they talk to each other.

## API calls and replies

- **Request label:** method and full path as the router sees it, prefix included, path params as the code writes them: `POST /api/v1/orders`, `GET /api/v1/orders/{id}`. External calls use the full URL. A header that decides the outcome goes on a second line with `<br/>`.
- **Every request gets its dashed reply** (`-->>`) back to the caller. The reply label starts with the status code and reason phrase, then the message or key fields exactly as the code returns them: `201 Created<br/>order_id, status: "pending"`, `401 Unauthorized<br/>"Invalid email or password"`, `204 No Content`. Use `-x` only for a call that gets no answer, `-)` only for fire-and-forget.
- **Every arrow that carries data gets payload parts:** `@payload.headers`, `@payload.query`, `@payload.params`, `@payload.cookies`, `@payload.body` for HTTP; `@payload.sql` for queries; `@payload.event` for messages; `@payload.input` / `@payload.result` for self-arrows. Field names exactly as the code defines them; values realistic but fake; never real secrets, tokens, emails or card numbers.
- **Every error the code can return on this path is a branch**: validation (400/422), 401, 403, 404, 409, 429, handled 5xx, each with status, message and error body. Success branch first, then errors in the order the code checks them.
- **Other hops follow the same idea:** a query shows the statement and its reply the result (`1 row: user u_9`, `0 rows`); an event shows its name with the data as `@payload.event`; a self-arrow is a check or decision the reader needs to see (`Verify JWT`), named as the code does it.
- A reply's `@step` names the outcome: the status, its reason or what the caller gets back ("The browser gets the result of the one and only charge.").

## Tags

The full grammar and lint codes are in `references/annotation-spec.md`.

| Tag | Write it | When |
|---|---|---|
| `@spec walkthrough/2` | once, after `sequenceDiagram` | always |
| `@title` | the flow as a teammate would name it | always |
| `@mode proposed` / `@scope` | header | Proposed / Scoped mode only |
| `@trigger` | what starts the flow | always |
| `@term <word>: <definition>` | one sentence, everyday words | every jargon word used in a `@step`, `@layer` or `@summary`; in Easy mode, every technical word |
| `@layer <alias> kind=<kind> <text>` | one per participant | always |
| `@section` + `@summary` | chapter name by purpose, one-line summary | flows over 8 steps: 2–6 chapters |
| `@step` | what happens and why, 1–2 sentences, under 240 chars, no label repeat | every arrow |
| `@payload.<part>` | see above | every arrow that carries data |
| `@ref <path:line>` | the line where the hop happens: route, call, query, `return`/`throw` | every step sent by a layer in this project (one, two at most) |
| `@uses <kind> <name> <path:line> <text>` | side part at this step | whenever one acts |
| `@effect` | email sent, metric emitted, log line, cache cleared | when the step causes something that is not an arrow |
| `@field <name> <where it came from>` | | when a returned value was created or looked up earlier |
| `@schema <field> <type, rule → status "message">` | one line per field | every validated request |
| `@state before` / `@state after` | | every write to a store or session |
| `@async`, `@retry`, `@timeout`, `@idempotent` | short text | when the code sets them |
| `@unconfirmed <text>` | | anything on this step you could not confirm |

Mermaid traps (`validate.py` catches them): `;` ends a statement, `#` cuts a label, keywords (`end`, `alt`, `loop`) cannot be aliases, every block needs `end`. Write `#59;` and `#35;`, or reword. Never write `%%{ … }%%`.

## Workflow

1. **Context.** Which flow, where it starts and ends, who reads it, which mode. If you can see the project, read the code first. Ask at most one batch of questions, only when the answer would change the diagram; not finding the code is such a case.
2. **Trace** as in *Accuracy*; write down each hop with `file:line`, what it sends and what it returns.
3. **Layers** as in *Layers and side parts*.
4. **Flow.** One arrow per hop that crosses a boundary; self-arrows only for a check the reader needs. `alt`/`else` for exactly-one outcomes, `opt` for maybe, `loop` for retries and polling, `par`/`and` for parallel work, named by the condition as the code tests it. `<br/>` breaks a long label.
5. **Chapters.** Boundaries where the reader's question changes. Steps before the first `@section` become "Start".
6. **Annotate** with the tag table above.
7. **Verify** as in *Accuracy*.
8. **Check** on stdin, never through a file. `scripts/` is next to this file.

   ```bash
   python scripts/validate.py - <<'MERMAID'
   <the full code>
   MERMAID
   ```

   Windows PowerShell:

   ```powershell
   $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
   @'
   <the full code>
   '@ | python scripts/validate.py -
   ```

   Fix every error and warning. Fix every hint unless the code shows it does not apply (a call that truly gets no reply). Run it again until it prints `clean`.
9. **Output** as below.

If Python cannot run, check by hand: every arrow has a `@step`; there is a `@title` and a `@trigger`; every alias has a `@layer`; no `@step` over 240 characters; no `;` or `#` in a label; every block has an `end`; every request has a reply with a status code; every `@uses` has a kind, a name and a ref.

## Output

Reply with this and nothing else:

````
**<Flow name>** · <Explain | Proposed | Scoped | Easy | Compact> · <N> steps, <N> layers, chapters: <names>, branches: <alt 1, loop 1 …>, side parts: <N>

```mermaid
<the full code>
```

Checked: validate.py clean
Verified: <N> of <N> refs re-opened, <M> unconfirmed
Not confirmed: <only what concerns the whole flow; leave the line out when empty>
````

- No prose before or after the code. Don't mention files, because none were written.
- Without code, write `Verified: built from <the description | the spec>, 0 refs` instead.

## Update mode

Given existing walkthrough code or the viewer's fix-prompt, change only what was asked.

- **Keep every arrow line exactly as it is, in the same order.** Notes, bookmarks and saved AI answers in the viewer are keyed by sender, receiver and label.
- Fix-prompt: add the missing `@step` lines directly above the listed arrows and fix the listed lint items; leave everything else, including existing `@step` text, untouched.
- A structural change the user asks for (new hop, new order, renamed label): make it and say in the reply which steps changed.
- A v1 file stays v1 unless the user asks for v2 tags; then add `@spec walkthrough/2`, `kind=`, `@trigger`, `@term` and payload parts without touching the arrows.
- Switching mode ("now the easy version", "show everything") means a new diagram at that mode from the same trace.
- Check on stdin and reply with the full updated code in the same output shape.

## Never

- Create files. Return the code; check it through stdin.
- Invent anything about the project: a layer, an endpoint, a field, a status code, a message, a `@ref`, a `@uses` name. One wrong detail costs more trust than a missing one.
- Remove, merge or fold layers, or drop middleware, unless the user explicitly asks for fewer or combined layers.
- Add steps outside the asked scope, or context "for completeness", in Scoped mode.
- Draw a guess as fact. Unconfirmed goes to `@unconfirmed` or *Not confirmed*.
- Write notes or bookmarks: they are personal and live in the viewer.
- Write `%%{ … }%%`: Mermaid config, not an annotation.

## Files in this skill

- `references/annotation-spec.md`: the walkthrough/2 grammar, rules, derived views, lint codes, Mermaid traps.
- `references/writing-guide.md`: good and bad examples for every tag; Explain vs Easy side by side; Proposed and Scoped examples.
- `references/layer-naming.md`: aliases, kinds and zones, layers vs side parts.
- `examples/payment-idempotency.mmd`: Explain mode from code. 18 steps, 5 chapters, nested `alt`, every tag in use.
- `examples/oauth-login.mmd`: 23 steps, 3 chapters, nested `alt`, `loop` with `opt`. Built from a description, so no refs.
- `scripts/validate.py`: the viewer's lint, Mermaid syntax traps and the API checks. Python 3 standard library only. Reads stdin with `-`; `--json` for a machine-readable result.

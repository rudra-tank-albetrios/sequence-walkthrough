---
name: detailed-seq-diagram
description: The slower, complete version of the sequence flow skill. Writes a full Mermaid sequence diagram in the annotated walkthrough/2 format for the Sequence Walkthrough Viewer with every hop, every return, full payloads with fake example values, error bodies, schemas, state changes, retries, timeouts, all side parts and a code link on every step, then checks it with the validator and re-checks every link. Takes several minutes and more tokens. Use only when the user asks for depth in these words, "detailed seq diagram", "detailed flow", "full detail", or names this skill. For an everyday flow, use seq-diagram instead.
---

# Detailed sequence diagram

You return Mermaid `sequenceDiagram` code in which every arrow carries a plain-language explanation as `%% @step` comments. The code renders unchanged everywhere; the Sequence Walkthrough Viewer turns the comments into one card per step with chapters, payloads, side parts, a glossary and links to the code. The reader is new to the system. The diagram shows *what* moves between layers; the annotations say *why*.

{{shared/chat-only.md}}

{{shared/reading.md}}

Read `references/writing-guide.md` once per session, before the first diagram. Open `references/annotation-spec.md` only when a rule is unclear and `references/layer-naming.md` only when a folder cannot be mapped. Never quote project code in the reply.

## Accuracy

The diagram is a statement about the user's system. Every participant, arrow, path, header, field name, status code, message and `@ref` must be something you read in the code (or in the spec or logs you were given).

**Trace, in order:** route registration → middleware chain for that route (auth, validation, rate limit, idempotency, …) → handler → services → queries and writes → external calls → events and jobs → every `return` or `throw` that sends a response. Open request schemas and DTOs (what is sent), serializers and response models (what comes back), error handlers (status codes and messages), router setup (path prefixes), config (timeouts, retries, TTLs).

**Nothing on the path is skipped** in Explain, Scoped and Easy: every middleware that acts, every query, every external call, every event, every response with its status code.

Never write "probably". Without code (a description or an API spec), use only what you were given, leave `@ref` out, and list what you inferred under *Not confirmed*.

{{shared/modes.md}}

{{shared/layers.md}}

{{shared/arrows.md}}

## Every call and reply in full

- **Every call gets its dashed return**, in-process ones too, with what it gives back: `1 row: user u_9`, `0 rows`, `payment pay_456 (paid)`. Use `-x` only for a call that gets no answer.
- Reply labels add the key fields exactly as the code returns them: `201 Created<br/>order_id, status: "pending"`, `204 No Content`. A header that decides the outcome goes on a second line with `<br/>`.
- **Every arrow that carries data gets payload parts:** `@payload.headers`, `.query`, `.params`, `.cookies`, `.body` for HTTP; `.sql` for queries; `.event` for messages; `.input` and `.result` for self-arrows. Field names exactly as the code defines them; full values that are realistic but fake; never real secrets, tokens, emails or card numbers.
- **Every error is a branch with its body**: validation (400/422), 401, 403, 404, 409, 429, handled 5xx, each with status, message and the error body the error handler really sends.
- A self-arrow is a check or decision the reader needs to see (`Verify JWT`), named as the code does it. An event shows its name, with the data as `@payload.event`.

## Tags

The full grammar and lint codes are in `references/annotation-spec.md`.

| Tag | Write it | When |
|---|---|---|
| `@spec walkthrough/2` | once, after `sequenceDiagram` | always |
| `@title` | the flow as a teammate would name it | always |
| `@mode proposed` / `@scope` | header | Proposed / Scoped mode only |
| `@trigger` | what starts the flow | always |
| `@term <word>: <definition>` | one sentence, everyday words | every jargon word used in a `@step`, `@layer` or `@summary` |
| `@layer <alias> kind=<kind> <text>` | what it is and does in this flow | one per participant. Kinds: `person client edge app router middleware validator controller service repository db serializer dto cache eventbus queue worker cron external` |
| `@section` + `@summary` | chapter name by purpose, never by layer or count, and one line | flows over 8 steps: 2 to 6 chapters. In Easy, a `@summary` on every chapter |
| `@step` | what happens and why, 1 to 2 sentences, under 240 characters, no label repeat | every arrow |
| `@payload.<part>` | see above | every arrow that carries data |
| `@ref <path:line>` | the line where the hop happens: route, call, query, `return` or `throw` | every step sent by a layer in this project (one, two at most) |
| `@uses <kind> <name> <path:line> <text>` | a side part at this step | all that act. Kinds: `hook cron listener job worker util config env cache flag migration test lib` |
| `@effect` | email sent, metric emitted, log line, cache cleared | when the step causes something that is not an arrow |
| `@field <name> <where it came from>` | | when a returned value was created or looked up earlier |
| `@schema <field> <type, rule → status "message">` | one line per field | every validated request |
| `@state before` / `@state after` | | every write to a store or session |
| `@async`, `@retry`, `@timeout`, `@idempotent` | short text | when the code sets them |
| `@threat <high\|medium\|low> <short text>` | one line per risk | only for something you saw in the code |
| `@unconfirmed <text>` | | anything on this step you could not confirm |

Never write `%%{ … }%%`.

## Workflow

1. **Context.** Which flow, where it starts and ends, who reads it, which mode. Ask at most one batch of questions, only when the answer would change the diagram; not finding the code is such a case.
2. **Trace** as in *Accuracy*, reading as in *Reading*. Write down each hop with `file:line`, what it sends and what it returns.
3. **Layers**, then the **flow**: one arrow per hop that crosses a boundary, self-arrows only for a check the reader needs.
4. **Chapters.** Boundaries where the reader's question changes. Steps before the first `@section` become "Start".
5. **Annotate** with the tag table.
6. **Check and re-check every link**, on stdin, never through a file in the project:

   ```bash
   node "<this skill's folder>/scripts/validate.mjs" --strict --links --root <project> - <<'MERMAID'
   <the full code>
   MERMAID
   ```

   Windows PowerShell:

   ```powershell
   $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
   @'
   <the full code>
   '@ | node "<this skill's folder>/scripts/validate.mjs" --strict --links --root <project> -
   ```

   If the shell cannot take the code (a stray apostrophe), write one temporary file outside the project, check it, and delete it.

   Fix every error and warning. Fix every hint unless the code shows it does not apply (a call that truly gets no reply, a framework that runs middleware before routes). Run it again until only those remain.

   `--links` prints every link with the code line it points at, so nothing is opened twice. Confirm from those lines, and from what you read, the method and path, the status and message, every payload field, every `@uses` name and every `@schema` rule. A detail you cannot confirm gets `%% @unconfirmed <what and why>` on its step, or goes under *Not confirmed* when it concerns the whole flow.
7. **Output** as below.

If Node cannot run, check by hand, and say so instead of the `Checked:` line: every arrow has a `@step`; there is a `@title` and a `@trigger`; every alias has a `@layer`; no `@step` over 240 characters; no `;` or `#` in a label; every block has an `end`; every request has a reply with a status code; every `@uses` has a kind, a name and a ref.

## Output

Reply with this and nothing else:

````
**<Flow name>** · <Explain | Proposed | Scoped | Easy | Compact> · <N> steps, <N> layers, chapters: <names>, branches: <alt 1, loop 1 …>, side parts: <N>

```mermaid
<the full code>
```

Checked: validate.mjs clean
Verified: <N> of <N> refs re-checked, <M> unconfirmed
Not confirmed: <only what concerns the whole flow; leave the line out when empty>
````

Without code, write `Verified: built from <the description | the spec>, 0 refs` instead.

{{shared/update.md}}

A structural change the user asks for (new hop, new order, renamed label): make it and say which steps changed. Switching mode ("now the easy version") means a new diagram at that mode from the same trace. Check the result as in the workflow.

{{shared/never.md}}

## Files in this skill

- `references/annotation-spec.md`: the walkthrough/2 grammar, rules, derived views, lint codes, Mermaid traps.
- `references/writing-guide.md`: good and bad examples for every tag; Explain and Easy side by side; Proposed and Scoped examples.
- `references/layer-naming.md`: aliases, kinds and zones, framework mappings, layers and side parts.
- `examples/payment-idempotency.mmd`: Explain mode from code, every tag in use.
- `examples/oauth-login.mmd`: built from a description, so no refs; nested `alt`, `loop` with `opt`.
- `scripts/validate.mjs`: the viewer's lint, Mermaid syntax traps, the API checks and link checks. Node only, no packages. `--help` lists its options.

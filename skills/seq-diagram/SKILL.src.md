---
name: seq-diagram
description: Fast everyday flow diagrams. Writes a Mermaid sequence diagram in the annotated walkthrough/2 format for the Sequence Walkthrough Viewer, from the project's real code, in about a minute. Use whenever someone wants the flow of a request, login, payment, webhook, job or feature, for example "diagram this flow", "how does X work", "walk me through the checkout", "explain only the part after the service layer", "how would I build X here", "in easy language", "check this diagram", or when the viewer's fix-prompt is pasted ("Add a %% @step line ... directly above these arrows").
---

# Sequence diagram

Reply with Mermaid `sequenceDiagram` code, with a `%% @step` on every arrow, from what you read in the project's code.

{{shared/chat-only.md}}

## Speed: answer within about a minute

- At most 3 rounds of tool calls, each one parallel batch, only the relevant line ranges of long files. Start the reply straight after the last read. Never plan or draft the diagram first, in your thinking or anywhere else.
- Read nothing in this skill's folders, unless a folder cannot be mapped: then only `references/layer-naming.md`.
- Never run the validator or re-open a file: the viewer checks on paste and its fix-prompt comes back here. Copy each path, status, message, field and line number from what you read.
- About 8 KB of code is normal, with no hard limit: never drop a layer or an error to fit.
- No status messages or prose.

To check a diagram when asked: `node scripts/validate.mjs -` from this skill's folder.

{{shared/reading.md}}

{{shared/modes.md}}

{{shared/layers.md}}

{{shared/arrows.md}}

## What each step carries

| Part | Rule |
|---|---|
| `@step` | Every arrow. One sentence on why, under 15 words, no label repeat. |
| What goes | Field names only, as the code names them: `%% @payload.body { cartId, amount }`, on the client's request, its 2xx reply and external calls, plus the error body shape once. Never real secrets. |
| What comes back | A dashed return only when a real value comes back or it decides a branch. |
| `@ref <path:line>` | On calls and client replies only. |
| `@section` + `@summary` | Flows over 8 steps: 2 to 6 chapters by purpose, never by layer or count. |
| `@uses` | Side parts, when they act. |
| `@threat <high\|medium\|low> <short text>` | One short line, only for something seen in the code. |
| `@unconfirmed <what>` | On a step with something unseen. |
| `@schema`, `@state`, `@field`, `@effect`, `@retry`, `@timeout`, `@async`, `@idempotent` | Only when the flow is about them. |

```
sequenceDiagram
    %% @spec walkthrough/2
    %% @title <flow name>
    %% @trigger <what starts it, under 12 words>
    %% @term <word>: <under 12 words>
    %% @layer <alias> kind=<kind> <path or tech, under 8 words>
    autonumber
    participant <alias> as <name>
    %% @section <chapter>
    %% @summary <under 10 words>
    %% @step <one sentence>
    %% @ref <path:line>
    A->>B: label
```

Required: `@spec`, `@title`, `@trigger`, one `@layer` per participant, `autonumber`. `@term` at most 3 words (Easy: every technical word). Kinds: `person client edge app router middleware validator controller service repository db serializer dto cache eventbus queue worker cron external`.

## Output

````
**<Flow name>** · <mode> · <N> steps, <N> layers

```mermaid
<code>
```

Not confirmed: <only if any>
````

{{shared/update.md}}

{{shared/never.md}}

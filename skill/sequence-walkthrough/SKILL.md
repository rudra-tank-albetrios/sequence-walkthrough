---
name: sequence-walkthrough
description: Write or update Mermaid sequence diagrams in the annotated walkthrough/1 format (%% @title, @layer, @section, @step, @payload, @ref comments) so a flow can be stepped through card by card in the Sequence Walkthrough Viewer. Every API call shows its method and path, every reply its status code and message, and payloads show what is sent and returned, all from the project's real code. Use this whenever someone wants a sequence diagram of how a request, login, payment, webhook, job or any other flow moves through their system, from source code, an API spec, logs or a plain description, in full detail or "in easy language". Also use it when they want an existing Mermaid sequence diagram explained step by step, annotated, checked or fixed, or when they paste the viewer's fix-prompt ("Add a %% @step line ... directly above these arrows"). Use it even if they only say "diagram this flow", "how does X call Y", "walk me through the checkout" or "document the login sequence".
---

# Sequence walkthrough

You produce Mermaid `sequenceDiagram` code where every arrow carries a plain-language explanation. The explanations are Mermaid comments (`%% @step ...`), so the code still renders unchanged on mermaid.live, GitHub and anywhere else. The Sequence Walkthrough Viewer reads them and shows one card per step, with chapters, layer descriptions, payloads and links to the code.

The reader is usually someone new to the system: a new teammate, a reviewer or a product person. The diagram shows *what* moves between layers: which API is called, what is sent, what comes back. The annotations say *why*. Write for that reader.

**You return the code in your reply. You never create a file** (no `.mmd`, no scratch copy), unless the user asks for one by name and location.

## The format in one screen

```mermaid
sequenceDiagram
    %% @spec walkthrough/1
    %% @title Password reset
    %% @layer U The person who forgot their password.
    %% @layer API Auth API. Issues and checks reset tokens.
    %% @layer DB Postgres. Stores a hash of each token, never the token itself.
    autonumber
    actor U as User
    participant API as Auth API
    participant DB as Database

    %% @section Request a link
    %% @step The user asks for a reset link. Only the email is sent.
    %% @payload Content-Type: application/json
    %% @payload { "email": "ana@example.com" }
    %% @ref src/routes/auth.ts:41
    U->>API: POST /api/v1/password/reset
    %% @step Only a hash of the token is stored, so a database leak does not leak working links.
    %% @payload INSERT INTO reset_tokens (user_id, token_hash, expires_at) VALUES ('u_9', 'sha256:5f…', now() + interval '30 min')
    %% @ref src/services/reset.ts:27
    API->>DB: INSERT reset_tokens<br/>user_id, token_hash, expires_at
    %% @step The token is saved.
    DB-->>API: 1 row inserted
    %% @step The answer is the same whether or not the email exists, so the form cannot be used to discover accounts.
    %% @payload { "message": "If that email is registered, a reset link is on its way." }
    %% @ref src/routes/auth.ts:52
    API-->>U: 202 Accepted<br/>"If that email is registered, a reset link is on its way."
```

| Tag | Where | What it is for |
|---|---|---|
| `@spec walkthrough/1` | right after `sequenceDiagram` | format version |
| `@title <name>` | top block | flow name, shown in the viewer and used for export names |
| `@layer <alias> <text>` | top block, one per participant | what this layer is and its job *in this flow* |
| `@section <name>` | above the first arrow of a chapter | chapter; runs until the next `@section` |
| `@step <text>` | directly above an arrow | what happens and why, 1–2 sentences, under 240 characters |
| `@payload <text>` | above an arrow | what this arrow carries: headers, query, body, SQL, event data; several lines are joined |
| `@ref <path:line or URL>` | above an arrow | the line in the code where this hop happens |

`@step`, `@payload` and `@ref` attach to the next arrow, even when a block keyword (`alt`, `loop`, `Note`) sits in between. The full rules, lint codes and fallbacks are in `references/annotation-spec.md`; read it when a rule is unclear.

## Accuracy: only what the project really does

The diagram is a statement about the user's system, so it must be true of their project, not of systems in general.

- **When you have the code, build the diagram from the code alone.** Every participant, arrow, path, header, field name, status code and message must be something you read in the code, or in the spec or logs you were given. Don't add layers the project doesn't have (load balancer, cache, queue, CDN), and don't leave out ones it does.
- **Trace before you draw.** Start at the route registration, then follow the request in order:
  - the middleware chain registered for that route: auth, validation, rate limit, idempotency and the like
  - the handler or controller
  - services
  - database queries and writes
  - external API calls
  - events or jobs it publishes
  - every `return` or `throw` that sends a response

  Open each file and note `file:line` for every hop as you go.
- **Read the files that hold the details:**
  - request schemas, DTOs and validators, for what is sent
  - serializers and response models, for what comes back
  - error handlers and exception mappers, for status codes and messages
  - router and app setup, for path prefixes such as `/api/v1`
- **Nothing on the path is skipped (full level).** Before you reply, walk the code path once more, from the route to the last response, and tick off each of these:
  - every middleware that runs
  - every query and write
  - every external call
  - every event
  - every response with its status code

  Anything in the code that isn't in the diagram is a miss. Add it.
- **Never draw a guess as fact.** If something can't be settled from the code, open the code that settles it. This includes a value from config or env, dynamic dispatch, or how a third-party service answers. If you still can't settle it, leave it out of the diagram and name it under *Not confirmed* in your reply. Don't write "probably" or "might" in a step.
- **If you can't find the code for the flow, ask for the path.** Don't fill the gap from general knowledge.
- **Without code** (a description or an API spec): use only what you were given, leave `@ref` out, and list what you had to infer under *Not confirmed*.

## API calls and responses

These rules make each card answer three questions: which API is called, what is sent, and what comes back.

- **Request arrows name the call:**
  - Use the HTTP method and the full path as the router sees it, prefix included, with path parameters written the way the code writes them: `POST /api/v1/orders`, `GET /api/v1/orders/{id}`.
  - Calls to external services use the full URL: `POST https://api.stripe.com/v1/payment_intents`.
  - Put a header that matters on a second line: `POST /api/v1/payments<br/>Idempotency-Key: 4f9c…`.
- **Every request gets its reply arrow**, dashed (`-->>`) back to the caller.
  - The label starts with the status code and reason phrase. Then comes the message or the key fields the code returns:
    - `201 Created<br/>order_id, status: "pending"`
    - `401 Unauthorized<br/>"Invalid email or password"`
    - `204 No Content`
  - Copy the status code and message text exactly from the code.
  - Use `-x` only for a call that gets no answer at all (timeout, dropped). Use `-)` only for fire-and-forget messages.
- **Every arrow that carries data gets a `@payload`:**
  - Requests show what is sent: the headers that matter (`Authorization`, `Cookie`, `Idempotency-Key`, `Content-Type` when it isn't JSON), query parameters, and the body.
  - Replies show what comes back: the body, plus headers such as `Set-Cookie`, `Location` and `Retry-After`.
  - Use the field names exactly as the code defines them. Values are realistic but fake. Never real secrets, tokens, emails or card numbers.
- **Error responses are part of the flow:**
  - At the full level, give every error the code can return on this path its own branch: validation (400 or 422), 401, 403, 404, 409, 429 and handled 5xx. Show each one's status code, message and error body.
  - Put the success path first, then the errors in the order the code checks them.
- **Other hops follow the same idea:**
  - A query shows the statement (table, columns, condition), and its reply shows the result: `1 row: user u_9`, `0 rows`.
  - An event shows its name, with the event data as `@payload`.
  - A self-arrow (`API->>API`) is a check or decision the reader needs to see, such as `Verify JWT` or `Compare password hash`, named as the code does it.

## Detail level

Two levels. Pick one from the user's words, and say which one you used in your reply.

**Full (the default).** Everything on the path, as described in *Accuracy* and *API calls and responses*:
- every hop
- every middleware that acts
- every error response
- payloads on every request and on every reply that carries data

Length is fine. Chapters keep it readable.

**Easy.** Use it when the user asks "in easy language", "simply", "in simple words", "high level", "overview", "short version", "for a non-technical person", "explain like I'm new", or similar.
- Keep only the steps needed to understand the flow:
  - the main request
  - the checks that change the outcome
  - the main data read or written
  - external calls that matter
  - the final response

  That means the success path, plus the one or two failures a user would actually meet.
- Fold internal layers into the layer the reader knows. For example, middleware and repositories become part of the API. Keep separate systems separate: the database, a payment provider, a queue.
- Labels still show the real call (`POST /api/v1/orders`) and the real status code and message (`201 Created`). Those are what the reader will see in the network tab and the logs.
- Write `@step` text in everyday words: no jargon, no class or function names, and no acronym without a word on what it is. One short sentence where possible.
- Every API request and reply still gets a `@payload`, trimmed to the fields that matter.
- Everything shown is still exact and from the project, with `@ref` lines. **Easy means fewer steps, not less accurate ones.**
- Aim for about 6–12 steps and 1–3 chapters.

## Workflow

### 1. Context
Find out which flow, where it starts and ends, who will read it, and which level. If you can see the project, read the code first. Ask at most one batch of questions, and only when the answer would change the diagram. Not finding the code for the flow is such a case.

### 2. Trace
Follow the *Accuracy* rules. Write down, in order, each hop with its `file:line`, what it sends and what it returns. This list is your source for every arrow, payload and `@ref`.

### 3. Layers
- Pick participants left to right in the order the call reaches them: the person, then the client, edge and middleware, then services, then data stores, then external systems.
- Use short upper-case aliases (`FE`, `API`, `DB`, `PSP`) and plain display names (`participant PSP as Payment Provider`). Use `actor` for people.
- Give every participant one `@layer` line saying what it is and what it does in this flow. `references/layer-naming.md` has common aliases.
- Group by responsibility, not by file. Five classes in one service are one layer, unless the flow is about how they talk to each other.

### 4. Flow
- One arrow per hop that crosses a boundary: a network call, a queue, a database query. Add a self-arrow only for a check or decision the reader needs to see.
- Requests are solid `->>`, replies dashed `-->>`. Labels follow *API calls and responses*. Use `<br/>` to break a long label over two lines.
- Use `alt`/`else` for outcomes where exactly one happens, `opt` for something that may not happen, `loop` for retries or polling, and `par`/`and` for parallel work. Name each block by its condition, as the code tests it: `alt Password matches`, `else User not found`.
- Mermaid traps (validate.py catches them):
  - A `;` ends the statement, so the line breaks.
  - Everything after a `#` disappears from a label.
  - `end`, `alt`, `loop` and other keywords cannot be aliases.

  Write `#59;` for `;` and `#35;` for `#`, or reword.

### 5. Chapters
Flows over 8 steps get `@section` chapters: 2–6 at the full level, 1–3 at the easy level. Name them by purpose ("Check the token", "Charge the card"), not by number. A chapter boundary sits where the reader's question changes. Steps before the first `@section` become a chapter called "Start".

### 6. Annotate
- Put `@spec`, `@title` and the `@layer` lines at the top, right after `sequenceDiagram`.
- Write `@step` above **every** arrow. A good step says what happens and why it matters: the risk it avoids, the rule it enforces, or what the next step depends on. Don't repeat the label.
- Add `@payload` lines as described above.
- When you built the diagram from code, give every step from a layer in this project one `@ref`, two at most. Point at the line where the hop happens: the route, the call, the query, or the `return`/`throw` that sends the reply. Use only lines you actually opened.
- `references/writing-guide.md` has good and bad examples. Read it before your first diagram in a session.

### 7. Check, without a file
Pipe the code into the checker on stdin. Don't save it anywhere. `scripts/` is next to this file.

```bash
python scripts/validate.py - <<'MERMAID'
<the full code>
MERMAID
```

In Windows PowerShell:

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
@'
<the full code>
'@ | python scripts/validate.py -
```

How to treat what it reports:
- **Errors**: Mermaid would refuse the code or cut a label. Fix every one.
- **Warnings**: the viewer's own lint. Fix every one.
- **Hints**: house style, including the API checks: missing reply, missing status code, missing payload, missing `@ref`. Fix them, unless the code shows the hint doesn't apply. For example, a call that really gets no reply.

Run it again until it says `clean`.

If Python can't run, check by hand:
- every arrow has a `@step`, and there is a `@title`
- every `@layer` alias exists
- no `@step` is over 240 characters
- there is no `;` or `#` in a label
- every block has an `end`
- every request has a reply with a status code

### 8. Output
Reply with this and nothing else:

````
**<Flow name>** · <Full | Easy> · <N> steps, <N> layers, chapters: <names>, branches: <alt 1, loop 1 ...>

```mermaid
<the full code>
```

Checked: validate.py clean · <N> of <N> steps linked to code
Not confirmed: <only what you could not confirm from the code; leave this line out when there is nothing>
````

- The `@step` lines are the explanation, so don't add a prose walkthrough before or after the code.
- Don't mention files, because none were written.
- When you worked without code, write `Checked: validate.py clean · built from <the description | the spec>` instead.

## Update mode

When you are given existing walkthrough code, or the viewer's fix-prompt, change only what was asked.

- **Keep every arrow line exactly as it is, in the same order.** The viewer matches each person's private notes and bookmarks to a step by sender, receiver and label. If you reword a label or reorder arrows, their notes come loose and land under "Notes for changed steps".
- With a fix-prompt: add the missing `@step` lines directly above the listed arrows and fix the listed lint items. Leave everything else, including existing `@step` text, untouched.
- If the user asks for a structural change, such as a new hop, a different order or a renamed label, make it. Say in your reply which steps changed, so they know which notes may need re-attaching.
- To switch level ("now the easy version", "show everything"), write a new diagram at that level from the same trace.
- Check it on stdin and reply with the full updated code, using the same output shape.

## Never

- **Create files.** Return the code in the reply. Check it through stdin. Write a file only when the user asks for one and says where.
- **Invent anything about the project:** a layer, an endpoint, a field, a status code, a message, an `@ref` path or line number. People act on these, and one wrong detail costs more trust than a missing one. When you work from a description, leave `@ref` out.
- **Write notes or bookmarks.** They are personal and live in each viewer's browser, not in the code.
- **Write `%%{ ... }%%`.** That is Mermaid's config syntax. It would override the viewer's theme, and it is not an annotation.

## Files in this skill

- `references/annotation-spec.md`: the walkthrough/1 spec, including rules, lint codes, fallbacks and title precedence.
- `references/writing-guide.md`: how to write each tag, with good and bad examples, plus the full and easy levels side by side.
- `references/layer-naming.md`: common aliases and the left-to-right order.
- `examples/payment-idempotency.mmd`: a full-level flow built from code. 18 steps, 5 chapters, nested `alt`, every request with its reply, status codes, payloads and refs.
- `examples/oauth-login.mmd`: 23 steps, 3 chapters, nested `alt`, and a `loop` with a nested `opt`. Redirects shown as `302 Found`, token calls with their replies. Built from a description, so it has no refs.
- `scripts/validate.py`: the viewer's lint, Mermaid syntax traps and the API checks. Python 3 standard library only. Reads stdin with `-`; use `--json` for a machine-readable result.

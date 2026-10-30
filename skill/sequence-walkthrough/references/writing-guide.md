# Writing guide

How to write each part of a walkthrough so a newcomer understands the flow from the cards alone. The complete files in `examples/` show all of it together.

The reader sees one step at a time: the arrow highlighted in the diagram, the label as the "Sends" line, and your `@step` text underneath. Each part has its own job, so don't make two of them say the same thing.

## `@title`: the flow's name

The title names the flow the way a teammate would ask about it. It also becomes the file name of every export.

| Good | Why |
|---|---|
| `Payment idempotency` | names the behaviour the diagram explains |
| `Sign in with OAuth (PKCE)` | the flow plus the variant that matters |
| `Order checkout: reserve, charge, confirm` | a longer flow with its three acts |

| Avoid | Problem |
|---|---|
| `Sequence diagram` | the viewer's fallback; says nothing |
| `PaymentController.handle()` | names code, not behaviour |
| `Flow v3 FINAL` | versions belong in the file history |

Keep it under about 50 characters, with no `/ \ : * ? " < > |` (they are stripped from file names).

## `@layer`: what each participant is and does here

One sentence for what it is, one for its job **in this flow**. Mention the detail the flow depends on.

| Good |
|---|
| `%% @layer DB Postgres. The unique index on idempotency_keys.key is the lock that decides who goes first.` |
| `%% @layer IDP Identity provider (OpenID Connect). Checks the password and MFA, then issues the tokens.` |
| `%% @layer Q RabbitMQ. Holds OrderPlaced events until the email worker takes them.` |

| Avoid | Problem |
|---|---|
| `%% @layer DB Database` | repeats the display name |
| `%% @layer API Handles requests and business logic and talks to the database and other services as needed` | true of every API, so it tells the reader nothing |

## `@section`: chapters

Use 2–6 chapters once a flow passes 8 steps (1–3 at the easy level). Name each one after the question it answers or the goal of its steps, in 1–4 words. Put a boundary where the reader's question changes: from "how does the request arrive?" to "who wins the race?", for example.

Good sets:
- `Claim the key` · `Outcomes` · `Retries`
- `Ask the identity provider` · `Swap the code for tokens` · `Use and refresh the session`
- `Validate the cart` · `Reserve stock` · `Charge the card` · `Confirm and notify`

Avoid `Part 1`, `Steps 4-9`, `Misc` and chapters of a single step, unless that step really is a stage of its own.

## Arrow labels: what is sent

Labels show the message itself. Keep them under about 45 characters per line, and use `<br/>` for a second line.
- **Requests:** the method and the full path as the router sees it.
- **Replies:** the status code first.
- **Queries:** the statement, with its table and condition.
- **Events:** the event name.

| Good | Avoid |
|---|---|
| `POST /api/v1/orders` | `Send the order to the API`, `POST /orders` when the router mounts it under `/api/v1` |
| `GET /api/v1/orders/{id}<br/>Authorization: Bearer …` | `Fetch order` |
| `POST https://api.stripe.com/v1/refunds` (external) | `Call Stripe` |
| `SELECT status, response FROM idempotency_keys<br/>WHERE key = 'abc-123'` | `Check DB` |
| `OrderPlaced event` | `notify` |
| `Verify JWT signature and expiry` (self-arrow) | `Process` |

Every request gets a reply (`-->>`) back to its caller. A reply starts with the status code and reason phrase, then the message or key fields exactly as the code returns them:

| Good | Avoid |
|---|---|
| `201 Created<br/>order_id, status: "pending"` | `Success!`, `Order created` |
| `401 Unauthorized<br/>"Invalid email or password"` | `Error`, `401` alone when the code sends a message |
| `409 Conflict<br/>Retry-After: 1` | `Busy` |
| `204 No Content` | `Done` |
| `1 row: user u_9` / `0 rows` (query) | `Found` |

Failures are replies too: `422 Unprocessable Entity<br/>"amount must be positive"`, or `timeout after 5 s` on a `-x` arrow.

## `@step`: what happens and why

This is the heart of the walkthrough. In 1–2 sentences under 240 characters, say what happens at this hop and **why it matters**: the risk it removes, the rule it enforces, or what a later step depends on. Assume the reader can see the label.

| Label | Weak `@step` | Strong `@step` |
|---|---|---|
| `POST /payments<br/>Idempotency-Key: abc-123` | Sends the payment request with the key. | The key travels in a header so the server can recognise repeats of this exact request. |
| `INSERT key ON CONFLICT DO NOTHING` | Inserts the key into the database. | The database decides who is first. The unique index lets exactly one request insert this key; every other request gets 0 rows. |
| `Set-Cookie: sid (HttpOnly)` | Sets a cookie. | The session id goes into a cookie page scripts cannot read, so a cross-site-scripting bug cannot steal the session. |
| `200 user profile` | Returns the profile. | The request succeeds as the signed-in user. |

The last row is fine: not every step needs a lesson. Short and true beats padded.

Tips:
- Start with the actor or the effect: "The database decides…", "The user is now signed in."
- Name the failure the step prevents when there is one: double charge, leaked token, lost update.
- Point forward or back when it helps: "…which step 7 relies on", "…so the retry in step 13 finds it."
- Use the reader's words, not class names. Put class and function names in `@ref`.
- Don't hedge ("this might possibly…"). If you are unsure how the code behaves, check it. If the code can't settle it, leave it out and name it under *Not confirmed* in your reply.

## `@payload`: what is sent and what comes back

Every arrow that carries data gets one: every API request, every reply with a body, queries, and events.
- **Requests:** the headers that matter (`Authorization`, `Cookie`, `Idempotency-Key`, `Content-Type` when it isn't JSON), then query parameters, then the body.
- **Replies:** the headers that matter (`Set-Cookie`, `Location`, `Retry-After`), then the body.
- **Field names:** copy them from the code's own schema, DTO, serializer or model. A made-up field name is as wrong as a made-up endpoint.
- **Values:** realistic but fake. Never real secrets, tokens, emails or card numbers.

Write one item per line. Several `@payload` lines join with line breaks.

Request:

```
%% @payload Authorization: Bearer eyJhbGciOi…
%% @payload Idempotency-Key: 4f9c2e1a-7b7d-4c55-9a51-3e0d6b2f8c10
%% @payload { "cartId": "cart_77", "amount": 149900, "currency": "INR" }
FE->>API: POST /api/v1/payments
```

Reply:

```
%% @payload { "id": "pay_456", "status": "paid", "amount": 149900, "currency": "INR" }
API-->>FE: 201 Created<br/>pay_456, status: paid
```

Error reply, with the error body the code's error handler really sends:

```
%% @payload { "error": "validation_failed", "message": "amount must be positive", "field": "amount" }
API-->>FE: 422 Unprocessable Entity<br/>"amount must be positive"
```

At the easy level, keep a payload on every API request and reply, trimmed to the fields a reader needs.

## `@ref`: where it lives

`path/to/file.ext:line`, relative to the repository root. Point at **the one line where the hop happens**: the route declaration, the call that sends the request, the query, or the `return` that sends the reply. A URL works for external docs.

When the diagram comes from code, every step sent by a layer in this project gets one. That includes its replies: point at the `return` or `throw` that sends the status code. Steps sent by the person, the database or an outside service have no line of ours to point at, so they go without. Add a second `@ref` only when the step really lives in two places, such as the call site in one service and the handler in another. The viewer shows each `@ref` as a chip the reader clicks to jump to the code. A list of every line the step touches buries the one that matters, so put the supporting detail in the `@step` text instead.

| Good | Too much |
|---|---|
| `%% @ref src/auth/login.js:28` | `%% @ref src/auth/login.js:26` `%% @ref src/auth/login.js:27` `%% @ref src/auth/login.js:28` `%% @ref src/auth/passwords.js:12` |

Only reference lines you have actually opened. When you work from a description or a spec without code, leave `@ref` out. A wrong reference sends the reader to the wrong place, which is worse than none.

## Full and easy, side by side

The same email-and-password login, written at both levels. Both come from the same trace of the code, and both are exact. The easy one just shows less.

| | Full (default) | Easy ("explain it in easy language") |
|---|---|---|
| Steps | Every hop: 14. Rate limit, body validation, user lookup, password check, session insert, cookie, and the 400, 401 and 429 branches. | The 6 that tell the story: submit, `POST /api/v1/auth/login`, find the user, check the password, save the session, `200 OK`. Plus the one failure people meet: `401`. |
| Layers | User, Web App, Rate Limiter, Auth API, Database | User, Web App, Auth API, Database. The rate limiter folds into the API. |
| Labels | `POST /api/v1/auth/login`, `401 Unauthorized<br/>"Invalid email or password"` | The same. Labels stay exact at both levels. |
| A `@step` | "bcrypt compares the typed password with the stored hash in constant time, so response timing can't reveal how close a guess was." | "The password is checked against the saved one. It is never stored as plain text." |
| Payloads | Every request and reply, all fields | Every API request and reply, key fields only |
| `@ref` | Every step from our code | Every step from our code |
| Chapters | 2–6 | 1–3 |

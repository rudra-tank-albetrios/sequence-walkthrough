# Writing guide

How to write each part of a walkthrough so a newcomer understands the flow from the cards alone. The complete files in `examples/` show all of it together.

The reader sees one step at a time: the arrow highlighted in the diagram, the label as the "Sends" line, your `@step` text underneath, then the payload boxes, side parts and chips. Each part has its own job, so don't make two of them say the same thing.

## `@title`: the flow's name

The title names the flow the way a teammate would ask about it. It also becomes the file name of every export.

| Good | Why |
|---|---|
| `Payment idempotency` | names the behaviour the diagram explains |
| `Sign in with OAuth (PKCE)` | the flow plus the variant that matters |
| `Proposed: Send the order receipt by email` | a design that does not exist yet (Proposed mode) |

| Avoid | Problem |
|---|---|
| `Sequence diagram` | the viewer's fallback; says nothing |
| `PaymentController.handle()` | names code, not behaviour |
| `Flow v3 FINAL` | versions belong in the file history |

Keep it under about 50 characters, with no `/ \ : * ? " < > |` (they are stripped from file names).

## `@trigger`: what starts it

One sentence on how the flow is entered: a click, a cron, a webhook, another flow. In Scoped mode it names the boundary: "Entered from OrderService.create() after the order row is saved."

| Good | Avoid |
|---|---|
| `%% @trigger The user taps Pay on the checkout page. A double tap or a reload re-enters the flow with the same key.` | `%% @trigger Start` |
| `%% @trigger Stripe calls POST /webhooks/stripe after a charge settles, at most once a minute per account.` | `%% @trigger The API is called` |

## `@term`: the glossary

One line per technical word used in a `@step`, `@layer` or `@summary`. The word, a colon, one sentence in everyday words, an example when it helps. In Easy mode every technical word gets one.

| Good |
|---|
| `%% @term tombstone: a marker row that says "this item was deleted", kept so other systems can see the deletion instead of just missing the row.` |
| `%% @term idempotent: safe to repeat; doing it twice has the same result as doing it once.` |

| Avoid | Problem |
|---|---|
| `%% @term JWT: JSON Web Token` | expands the letters, explains nothing |
| `%% @term idempotency key: see RFC` | sends the reader away |

## `@layer`: what each participant is and does here

The participant is a layer named after what it does in this project (`participant MW as Middleware`, `participant SVC as Service`, `participant PG as Pages`); the `@layer` line says what that layer is here and what it does **in this flow**, with the `kind=` the viewer uses for icons and trust boundaries. Mention the folder or technology and the detail the flow depends on.

| Good |
|---|
| `%% @layer DB kind=db Postgres. The unique index on idempotency_keys.key is the lock that decides who goes first.` |
| `%% @layer MW kind=middleware src/middleware. Runs authenticate, validate and idempotency in that order; idempotency makes one key mean one charge.` |
| `%% @layer SVC kind=service src/services. PaymentService creates the payment and charges the card; RefundService is not on this path.` |
| `%% @layer MQ kind=queue BullMQ queue "mail" in Redis. Keeps receipt jobs until the mail worker takes them.` |

| Avoid | Problem |
|---|---|
| `%% @layer DB Database` | repeats the display name, no kind |
| `%% @layer SVC kind=service Handles business logic and talks to the database as needed` | true of every service, so it tells the reader nothing |
| `participant PS as Payment Service` next to `participant OS as Order Service` | one layer drawn twice: one `Service` participant, and the labels name `PaymentService` and `OrderService` |
| `participant MW as Idempotency Middleware`, `participant AUTH as Auth Middleware` | one `Middleware` participant; each middleware is a step (`MW->>MW: authenticate()`) |
| `participant API as Payments API` for routes, controller and service together | each layer is its own participant; only Compact merges them, into `API as Backend` |
| `participant CRON as Cron` in a flow it does not start | a cron is a side part (`@uses cron cleanupKeys …`) unless it starts the flow, and then it is drawn first |

## `@section` and `@summary`: chapters

Use 2–6 chapters once a flow passes 8 steps. Name each one after the question it answers or the goal of its steps, in 1–4 words, and give it one `@summary` line that says what the chapter settles. Put a boundary where the reader's question changes: from "how does the request arrive?" to "who wins the race?".

Good sets:
- `Claim the key` · `Charge once` · `Repeats` · `Finish`
- `Ask the identity provider` · `Swap the code for tokens` · `Use and refresh the session`

```
%% @section Claim the key
%% @summary The database, not the server, decides which request owns the key.
```

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
| `200 user profile` | Returns the profile. | The request succeeds as the signed-in user, who gets their profile back. |

**A reply's `@step` names the outcome**: the status, its reason, or what the caller gets back. "The browser gets the result of the one and only charge." passes; "The middleware finishes." does not (the validator hints `step-outcome`).

Tips:
- Start with the actor or the effect: "The database decides…", "The user is now signed in."
- Name the failure the step prevents when there is one: double charge, leaked token, lost update.
- Point forward or back when it helps: "…which step 7 relies on", "…so the retry in step 13 finds it."
- Use the reader's words, not class names. Class and function names go in `@ref` and `@uses`.
- Don't hedge. If the code can't settle it, write `@unconfirmed` on the step.

## `@payload.<part>`: what is sent and what comes back

Every arrow that carries data gets payload parts. One part per line; several lines of the same part join with line breaks.

| Part | For |
|---|---|
| `headers` | `Authorization`, `Cookie`, `Idempotency-Key`, `Content-Type` when it isn't JSON; on replies `Set-Cookie`, `Location`, `Retry-After` |
| `query`, `params`, `cookies` | query string, path parameters, cookies |
| `body` | the request or reply body |
| `sql` | the statement a query sends |
| `event` | the message put on a queue |
| `input`, `result` | what a self-arrow works on and produces |

Field names come from the code's own schema, DTO, serializer or model: a made-up field name is as wrong as a made-up endpoint. Values are realistic but fake; never real secrets, tokens, emails or card numbers.

```
%% @payload.headers Authorization: Bearer eyJhbGciOi…
%% @payload.headers Idempotency-Key: 4f9c2e1a-7b7d-4c55-9a51-3e0d6b2f8c10
%% @payload.body { "cartId": "cart_77", "amount": 149900, "currency": "INR" }
FE->>APP: POST /api/v1/payments
```

Error reply, with the error body the code's error handler really sends:

```
%% @payload.body { "error": "validation_failed", "message": "amount must be positive", "field": "amount" }
APP-->>FE: 422 Unprocessable Entity<br/>"amount must be positive"
```

Plain `@payload` (no part) is still valid for data that has no natural part.

## `@schema`, `@state`, `@field`: the data in detail

- **`@schema <field> <type, rule → status "message">`**, one line per field, on every validated request. It tells the reader which inputs can fail and what they get back.
  `%% @schema amount integer in minor units, greater than 0 → 422 "amount must be positive"`
- **`@state before` / `@state after`** on every write to a store or session: what is true before and after, in one line each.
  `%% @state before idempotency_keys has no row for key 4f9c…` · `%% @state after one row with status 'running' owned by this request`
- **`@field <name> <where it came from>`** when a returned value was created or looked up earlier: `%% @field id pay_456, created by the INSERT INTO payments just before this reply`. "step 6" in the text becomes a link.

## `@uses` and `@effect`: what else is involved

- **`@uses <kind> <name> <path:line> <text>`** names a side part that runs at this step but is not a layer: a hook, a cron that filled the data, a listener, a util, config, an env value, a flag. Always with the line where it lives when the flow comes from code.

  | Good | Avoid |
  |---|---|
  | `%% @uses hook useIdempotencyKey src/checkout/useIdempotencyKey.ts:8 Reads the key for this cart from sessionStorage, or creates one.` | `%% @uses hook useIdempotencyKey` (no ref, no job) |
  | `%% @uses env IDEMPOTENCY_TTL_HOURS src/config.ts:14 How long a key row is kept before cleanup.` | `%% @uses middleware auth …` (middleware is a layer) |

- **`@effect <text>`** for something the step causes that is not an arrow: `%% @effect PaymentPaid event published for the receipt email worker`, `%% @effect Log line "payment created" with payment_id and key`.

## Chips: `@async`, `@retry`, `@timeout`, `@idempotent`, `@unconfirmed`

Short text, only when the code sets them: `%% @retry 2 retries on a network error, same key each time`, `%% @timeout 5 s`, `%% @async consumed by the email worker within a minute`, `%% @idempotent Repeats with the same key get the first answer back.`

`%% @unconfirmed <what and why>` marks a detail you could not settle from the code: `%% @unconfirmed The provider's timeout comes from PSP_TIMEOUT_MS, which is not set in any checked-in config.` Better an orange chip than a confident guess.

## `@threat`: a possible problem

`%% @threat <high|medium|low> <short text>` on the step, one short line, only for something you saw in the code. It means "possible problem, please check", not a finding from an audit.

| Good | Avoid |
|---|---|
| `%% @threat medium The reset token is written to the log line.` | `%% @threat high Could be hacked` (nothing seen) |
| `%% @threat high The card number is stored in the job payload.` | `%% @threat low Consider rate limiting everywhere` (general advice, not this step) |

## `@ref`: where it lives

`path/to/file.ext:line`, relative to the repository root. Point at **the one line where the hop happens**: the route declaration, the call that sends the request, the query, or the `return` that sends the reply. A URL works for external docs.

When the diagram comes from code, every step sent by a layer in this project gets one, replies included (the `return` or `throw`). Steps sent by the person, the database or an outside service have no line of ours to point at, so they go without. Add a second `@ref` only when the step really lives in two places. Only reference lines you have actually opened; the validator's `--links` prints them back for the verify pass, so no file is opened twice. Without code, leave `@ref` out.

| Good | Too much |
|---|---|
| `%% @ref src/auth/login.js:28` | `%% @ref src/auth/login.js:26` `%% @ref src/auth/login.js:27` `%% @ref src/auth/login.js:28` `%% @ref src/auth/passwords.js:12` |

## Explain and Easy, side by side

The same email-and-password login in both modes. Same trace, same layers, same 14 arrows, same labels, payloads and refs. Easy changes only the words.

| | Explain (default) | Easy ("beginner friendly") |
|---|---|---|
| Layers | User, Web App, App, Routes, Middleware, Validator, Controller, Service, Repository, Database | The same ten, with the same names. Middleware stays. |
| Steps | 14: rate limit, body validation, user lookup, password check, session insert, cookie, and the 400, 401 and 429 branches | The same 14 |
| Labels | `POST /api/v1/auth/login`, `401 Unauthorized<br/>"Invalid email or password"` | The same |
| A `@step` | "bcrypt compares the typed password with the stored hash in constant time, so response timing can't reveal how close a guess was." | "The password is checked against the saved scrambled copy. The check always takes the same time, so a guess cannot be measured." |
| `@term` | for the jargon the steps use | one for every technical word: `hash`, `session`, `cookie`, `rate limit`, `constant time` |
| `@summary` | optional | on every chapter |
| Payloads, refs, chips | all | all, unchanged |

A **Compact** version (fewer steps, merged layers) exists only when the user asks for it in those words.

## Proposed flow

"I want to add a receipt email after payment. How would it work here?" The project has a `PaymentPaid` event, an email worker and a `MAIL` provider. The diagram reuses them and marks itself as a design:

```
sequenceDiagram
    %% @spec walkthrough/2
    %% @mode proposed
    %% @title Proposed: Receipt email after payment
    %% @trigger payment.paid event, emitted today by src/services/payment.service.ts:41.
    %% @layer EB kind=eventbus src/events. Already carries payment.paid; a new listener is added here.
    %% @layer MQ kind=queue BullMQ queue "mail". Already used for password-reset emails.
    %% @layer MWK kind=worker src/workers/mail.worker.ts. Gets a new "payment-receipt" job type, following the reset email.
    %% @layer MAIL kind=external Transactional email provider already used for password resets.
    autonumber
    participant EB as Event Bus
    participant MQ as Mail Queue
    participant MWK as Mail Worker
    participant MAIL as Email Provider
    %% @step A new payment.paid listener queues the receipt job, so nothing changes in the payment path.
    %% @payload.event { "name": "payment-receipt", "data": { "paymentId": "pay_456", "email": "ana@example.com" } }
    %% @ref src/events/user.events.ts:14 (pattern)
    EB->>MQ: mailQueue.add("payment-receipt")
    %% @step The mail worker takes the job like any other email job.
    %% @payload.event { "name": "payment-receipt", "data": { "paymentId": "pay_456", "email": "ana@example.com" } }
    MQ->>MWK: job payment-receipt
    %% @step The receipt is sent with the same provider client and template helper the reset email uses.
    %% @payload.body { "to": "ana@example.com", "template": "receipt", "data": { "payment_id": "pay_456", "amount": 149900 } }
    %% @ref src/workers/mail.worker.ts:18 (pattern)
    MWK->>MAIL: POST https://api.mail.example/v1/send
    %% @step The provider accepts the message; the worker marks the job done only after this answer, so a failure is retried.
    %% @payload.body { "id": "msg_1", "status": "queued" }
    MAIL-->>MWK: 202 Accepted<br/>msg_1
```

Existing steps keep real refs. New steps point at the code they should copy, marked `(pattern)`. Nothing in it is an endpoint or field the project's style would not produce.

## Scoped flow

"Show only the email sending after the service layer." The first participant is the layer where the scope begins, `@scope` and `@trigger` say where it is entered from, and nothing before the boundary is drawn:

```
    %% @scope Starts after OrderService.create() has saved the order; ends when the provider answers.
    %% @trigger Entered from OrderService.create(), src/services/order.service.ts:58, after the order row is committed.
    autonumber
    participant SVC as Service
    participant EB as Event Bus
    participant MQ as Mail Queue
    participant MWK as Mail Worker
    participant MAIL as Email Provider
```

No request arrow from the browser, no middleware chapter, no "for context" steps: the user asked for one part, so the diagram is that part.

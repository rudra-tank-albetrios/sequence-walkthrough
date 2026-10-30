# Layer naming

Participants go left to right in the order a request reaches them, so most arrows point right and replies point left. The reader's eye then follows the call as it goes deeper.

## Order

```
people → clients → edge → middleware → services → workers → data stores → external systems
```

When two layers are at the same depth, put the one that is called first on the left. Put external systems (payment provider, identity provider, email service) at the far right, even when the browser talks to them directly, because they are outside your system.

## Kinds and zones

Every `@layer` line carries a `kind=`. The viewer uses it for an icon and for the dotted trust-boundary lines between zones.

| Kind | Zone | Use it for |
|---|---|---|
| `person` | client | people: use `actor` |
| `client` | client | browser app, mobile app, CLI, another team's client |
| `edge` | ours | CDN, API gateway, load balancer, BFF |
| `middleware` | ours | anything registered on the route before the handler: auth, validation, rate limit, idempotency, logging that changes the outcome |
| `service` | ours | the API or a bounded-context service |
| `worker` | ours | job runner, scheduler, email worker |
| `db` | ours | relational or document database, session store |
| `cache` | ours | Redis, in-memory cache |
| `queue` | ours | RabbitMQ, SQS, Kafka topic |
| `external` | outside | payment provider, identity provider, email or SMS gateway, partner API |

```
%% @layer MW kind=middleware Express middleware in front of the payment routes. Makes sure one key means one charge.
```

## Common aliases

Aliases are short and upper case, and they stay the same across a team's diagrams. Display names are plain words (`participant PSP as Payment Provider`).

| Group | Alias | Display name | Kind | Typical `@layer` focus |
|---|---|---|---|---|
| People | `U` | User / Shopper / Admin | `person` | what they do and see |
| Clients | `FE` | Web App / Checkout UI | `client` | what the browser keeps (cookies, sessionStorage) |
| | `APP` | Single-page app | `client` | when there is also a separate web server |
| | `MOB` | Mobile App | `client` | stored tokens, retries on bad networks |
| | `CLI` | Command-line tool | `client` | |
| Edge | `CDN` | CDN | `edge` | caching rules that matter to the flow |
| | `GW` | API Gateway | `edge` | auth checks, rate limits, routing |
| | `LB` | Load Balancer | `edge` | only if the flow depends on it |
| | `BFF` | Backend for Frontend | `edge` | what it hides from the client |
| Middleware | `MW` | Idempotency / Rate-limit Middleware | `middleware` | name it by its job |
| | `AUTH` | Auth Middleware | `middleware` | how identity is checked |
| | `VAL` | Validation Middleware | `middleware` | which schema, which error shape |
| Services | `API` | Orders API | `service` | the main service of the flow |
| | `SVC` | <Name> Service | `service` | a generic internal service; prefer a specific alias |
| | `OS` `PS` `IS` `NS` | Order / Payment / Inventory / Notification Service | `service` | one alias per bounded context |
| Workers | `WK` | Email Worker / Job Runner | `worker` | what triggers it, what it retries |
| | `SCH` | Scheduler / Cron | `worker` | |
| Data | `DB` | Database (say which: Postgres, MySQL) | `db` | the table, index or transaction that matters |
| | `CACHE` | Redis / Cache | `cache` | TTLs and what is cached |
| | `Q` | Queue (RabbitMQ, SQS, Kafka topic) | `queue` | delivery guarantees |
| | `S3` | Object Storage | `db` | |
| | `SRCH` | Search Index | `db` | |
| External | `PSP` | Payment Provider | `external` | what it guarantees, such as idempotency or webhooks |
| | `IDP` | Identity Provider | `external` | which protocol |
| | `MAIL` | Email Service | `external` | |
| | `SMS` | SMS Gateway | `external` | |
| | `EXT` | <Partner> API | `external` | |

## Middleware is always a layer

Every middleware that runs on the route is a participant with `kind=middleware`, in every mode and at every level of detail. It is never folded into the API, never left out "because it just passes things along", and never written as a `@uses` side part. If three middlewares run (auth, validation, rate limit), draw three participants, or one `MW` participant whose self-arrows show the three checks in order; say which in the `@layer` text.

## Layers vs side parts

| It is a layer (`@layer`, its own participant) | It is a side part (`@uses` on the step where it acts) |
|---|---|
| Anything with a network, queue or database boundary of its own | Code that runs inside a layer without a boundary of its own |
| Middleware on the route | A React or framework hook that prepares a value |
| A separate service, worker or scheduler process that the flow calls or that calls into the flow | A cron or job that filled the data this step reads |
| A database, cache, queue or object store | A util, lib or SDK the layer calls in-process |
| An external provider | Config, an env value, a feature flag, a migration, a test that defines the shape |

## Choosing the level of detail

- **One layer per responsibility the reader must tell apart.** Middleware, the service, the store and the external system are always apart.
- **Split a service only when the flow is about the split.** A login flow may need `AUTH` middleware and the `API` separately. A checkout flow usually doesn't split the API further.
- **Same alias, same thing.** If `DB` is Postgres in one chapter, a cache is `CACHE`, not `DB2`.
- **Avoid keywords as aliases.** `end`, `alt`, `opt`, `loop`, `par`, `and`, `else`, `note`, `box` and `rect` break the parser.
- **Keep it to about 7 layers.** More than that won't fit on a laptop screen at a readable zoom. Make a second diagram instead of merging layers; merge only when the user asks for a Compact version.

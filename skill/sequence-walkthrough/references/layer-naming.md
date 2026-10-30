# Layer naming

Participants go left to right in the order a request reaches them, so most arrows point right and replies point left. The reader's eye then follows the call as it goes deeper.

## Order

```
people → clients → edge → middleware → services → workers → data stores → external systems
```

When two layers are at the same depth, put the one that is called first on the left. Put external systems (payment provider, identity provider, email service) at the far right, even when the browser talks to them directly, because they are outside your system.

## Common aliases

Aliases are short and upper case, and they stay the same across a team's diagrams. Display names are plain words (`participant PSP as Payment Provider`).

| Group | Alias | Display name | Typical `@layer` focus |
|---|---|---|---|
| People | `U` | User / Shopper / Admin | what they do and see; use `actor` |
| Clients | `FE` | Web App / Checkout UI | what the browser keeps (cookies, sessionStorage) |
| | `APP` | Single-page app | when there is also a separate web server |
| | `MOB` | Mobile App | stored tokens, retries on bad networks |
| | `CLI` | Command-line tool | |
| Edge | `CDN` | CDN | caching rules that matter to the flow |
| | `GW` | API Gateway | auth checks, rate limits, routing |
| | `LB` | Load Balancer | only if the flow depends on it |
| | `BFF` | Backend for Frontend | what it hides from the client |
| Middleware | `MW` | Idempotency / Rate-limit Middleware | name it by its job |
| | `AUTH` | Auth Middleware / Auth Service | how identity is checked |
| Services | `API` | Orders API | the main service of the flow |
| | `SVC` | <Name> Service | a generic internal service; prefer a specific alias |
| | `OS` `PS` `IS` `NS` | Order / Payment / Inventory / Notification Service | one alias per bounded context |
| Workers | `WK` | Email Worker / Job Runner | what triggers it, what it retries |
| | `SCH` | Scheduler / Cron | |
| Data | `DB` | Database (say which: Postgres, MySQL) | the table, index or transaction that matters |
| | `CACHE` | Redis / Cache | TTLs and what is cached |
| | `Q` | Queue (RabbitMQ, SQS, Kafka topic) | delivery guarantees |
| | `S3` | Object Storage | |
| | `SRCH` | Search Index | |
| External | `PSP` | Payment Provider | what it guarantees, such as idempotency or webhooks |
| | `IDP` | Identity Provider | which protocol |
| | `MAIL` | Email Service | |
| | `SMS` | SMS Gateway | |
| | `EXT` | <Partner> API | |

## Choosing the level of detail

- **One layer per responsibility the reader must tell apart.** If middleware decides the outcome (idempotency, auth, rate limits), give it its own layer. If it just passes things along, fold it into the service.
- **Split a service only when the flow is about the split.** A login flow may need `AUTH` and `API` separately. A checkout flow usually doesn't.
- **Same alias, same thing.** If `DB` is Postgres in one chapter, a cache is `CACHE`, not `DB2`.
- **Avoid keywords as aliases.** `end`, `alt`, `opt`, `loop`, `par`, `and`, `else`, `note`, `box` and `rect` break the parser.
- **Keep it to about 7 layers.** More than that won't fit on a laptop screen at a readable zoom. Merge peripheral systems, or make a second diagram.

# Layer naming

Layers come from the project's own folders, mapped by what each folder does. A reader who has seen one flow of a project should recognise every other flow of it, so a layer keeps the same name, alias and place in all of that project's diagrams.

## The default backend order

Use this order when those parts exist. Draw only the layers the flow passes through, and never search for a folder that is not there.

| # | Alias | Display name | `kind=` | The folder or file that plays this part |
|---|---|---|---|---|
| 1 | `U` | User, Admin, Shopper | `person` | the person; `actor` |
| 2 | `FE` | Frontend, or its real parts (below) | `client` | the caller of the backend |
| 3 | `GW` | API Gateway | `edge` | only when a gateway, CDN or load balancer changes the outcome |
| 4 | `APP` | App | `app` | `app.js`, `server.ts`, `main.py`, `index.ts`, `bootstrap/`: the server that receives the request, mounts the routers, runs the global error handler and sends the response |
| 5 | `RT` | Routes | `router` | `routes/`, `router/`, `urls.py`, `*.routes.ts`: path + method → middleware chain → controller |
| 6 | `MW` | Middleware | `middleware` | `middleware/`, `middlewares/`, guards, interceptors, filters |
| 7 | `VAL` | Validator | `validator` | `validators/`, `validations/`, `schemas/`, `requests/`, pipes: request-shape checks |
| 8 | `CTRL` | Controller | `controller` | `controllers/`, `handlers/`, `views.py`, route handlers, resolvers |
| 9 | `SVC` | Service | `service` | `services/`, `use-cases/`, `domain/`: business logic |
| 10 | `REPO` | Repository | `repository` | `repositories/`, `repos/`, `dao/`, or `models/` when the models hold the queries |
| 11 | `DB` | Database | `db` | the database itself; say which (Postgres, MySQL, MongoDB) in `@layer` |
| 12 | `SER` | Serializer | `serializer` | `serializers/`, `transformers/`, `resources/`, `presenters/`, `mappers/`: shapes the response |
| 13 | `DTO` | DTO | `dto` | `dto/`, `*.dto.ts`, response models, when the flow crosses them as a step of its own |

Then, when the flow crosses them:

| Alias | Display name | `kind=` | The folder or file |
|---|---|---|---|
| `RDS` | Redis, or `Cache` when it is not Redis | `cache` | `redis/`, `cache/` |
| `EB` | Event Bus | `eventbus` | `events/`, `emitters/`, `listeners/`, `subscribers/` |
| `MQ` | Mail Queue, named after the queue | `queue` | `queues/`; one participant per queue: `Mail Queue`, `SMS Queue` (`SQ`), `Export Queue` (`XQ`) |
| `MWK` | Mail Worker, named after its queue | `worker` | `workers/`, `jobs/`, `processors/`; one per worker: `Mail Worker`, `SMS Worker` (`SWK`) |
| `STO`, `SRCH` | Storage, Search | `db` | `storage/`, `uploads/`, `search/`: S3, GCS, Elasticsearch, Algolia |
| `SOCK` | Socket | `edge` | `sockets/`, `gateways/` for WebSocket or Socket.IO |
| `PSP` `MAIL` `SMS` `IDP` `EXT` | Payment Provider, Email Provider, SMS Gateway, Identity Provider, `<Partner> API` | `external` | systems outside the project, always at the far right |

**Starters go first.** When a cron, a worker or a listener starts the flow instead of a client, that layer is the leftmost participant (`participant CRON as Cron`, `kind=cron`) and the rest keep their order.

**The name says what it does, not what the folder is called.** A project may call the folder `handlers/` or `views.py`: in the default structure the participant is still `participant CTRL as Controller`. A project without `repositories/` whose services query the ORM directly has no Repository layer, and the queries go from Service to Database.

## Other structures get their own layers

Keep the order a request really runs in. A hint from the validator about the default order does not apply when the framework itself runs them in another order.

| Project | Layers, in the order a request runs | Where they live |
|---|---|---|
| Express, Koa, Fastify | App → Routes → Middleware → Validator → Controller → Service → Repository → Database → Serializer | `app.js`, `routes/`, `middleware/`, `validators/`, `controllers/`, `services/`, `repositories/`, `serializers/` |
| NestJS | App → Middleware (guards and interceptors) → Validator (pipes) → Controller → Service → Repository → Database → DTO | `main.ts`, `*.guard.ts`, `ValidationPipe` with `dto/`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`. Routes are decorators on the controller, so there is no Routes layer. Modules (`*.module.ts`) wire these together and are not on the path: when a flow crosses modules, the labels name them |
| Next.js | Pages → Components → API Client → Middleware → API Route → Service → Database | `app/**/page.tsx`, `components/`, `lib/api*`, `middleware.ts`, `app/api/**/route.ts` (`kind=controller`) |
| Django | Middleware → Routes → Validator → Controller → Service → Database → Serializer | `settings.py` `MIDDLEWARE`, `urls.py` of the project and the app, DRF `serializers.py` for input, `views.py`, `services.py`, `models.py`, `serializers.py` for output. Django runs middleware before it matches the URL. An app (`orders/`) is not a layer: the labels name it |
| Laravel | Routes → Middleware → Validator → Controller → Service → Repository → Database → Serializer | `routes/api.php`, `app/Http/Middleware`, `app/Http/Requests`, `app/Http/Controllers`, `app/Services`, `app/Repositories` or Eloquent models, `app/Http/Resources` |
| Feature folders | App → Routes → Middleware → Validator → Controller → Service → Repository → Database → Serializer | `src/server.ts`, then inside `src/features/<name>/` each file by what it does: `routes`, `schema`, `handler`, `logic`, `store`, `view`. A feature is not a layer: the labels name it |

## Frontend layers

Frontend layers come from its real folders and main parts, such as Pages → Components → Store → API Client (`kind=client` for each), with `@uses hook …` on the step where a hook acts. When the flow is about the backend and the frontend code was not read, draw one `FE`. Without code at all (a description or a spec), draw only the layers that were described, and list under *Not confirmed* the layers you could not see.

## No duplicates

- **Each layer once.** Two controllers, three services or two repositories on the path are still one `Controller`, one `Service`, one `Repository`. The arrow labels say which class or function acts: `PaymentService.createPayment()`, `UserRepository.findById()`.
- **One participant per store and per queue.** The same Postgres is `DB` in every step; a second queue gets its own name (`SMS Queue`), never `MQ2`.
- **Same alias, same thing, in every diagram of the project.** `RDS` is always Redis, `MW` is always Middleware.
- **A separate deployed system** (another repository or process reached over the network) is a participant of its own, named by the system (`participant INV as Inventory Service`, `kind=external` when another team owns it).

## Which middleware, which validator: inside the layer

The steps say exactly what runs:

- `RT->>MW` carries the route's chain as the route file registers it, in order: `router.post("/", authenticate, validate(createPaymentSchema), idempotency)`. Don't start this label with an HTTP method: only the client's request (`FE->>APP`) carries `POST /api/v1/payments`.
- Each middleware that acts gets its own step, named as the code names it: a self-arrow `MW->>MW: authenticate()` for a check done in place, or an arrow to the layer it calls (`MW->>VAL: createPaymentSchema.parse(body)`, `MW->>RDS: SET idem:4f9c… NX`).
- `MW->>CTRL: next() → PaymentController.create()` hands over to the controller.
- The same holds for every layer: `CTRL->>SVC: PaymentService.createPayment(userId, dto)`, `SVC->>REPO: PaymentRepository.markPaid(id)`, `CTRL->>SER: PaymentSerializer.toJSON(payment)`, `SVC-)EB: emit("payment.paid")`, `EB->>MQ: mailQueue.add("receipt")`, `MQ->>MWK: job receipt`.

## How the request comes back

- `seq-diagram` draws a dashed return when a real value comes back or it decides a branch (`REPO-->>SVC: payment pay_456`, `SER-->>CTRL: { id, status, amount }`). `detailed-seq-diagram` draws every return.
- **A reply to the client is drawn from the layer that received the request,** so the two pair up: `FE->>APP: POST /api/v1/payments`, then `APP-->>FE: 201 Created<br/>pay_456`. The layer that writes it draws a dashed arrow to `APP` with the call as the code writes it (`CTRL-->>APP: res.status(201).json(body)`, `MW-->>APP: next(new UnauthorizedError())`), and its `@step` says which layer produced it. Errors that are thrown go to the app's error handler, so they leave the same way.
- Routes and Middleware do not relay the response unless their code touches it (an idempotency middleware that saves the response, a logger that adds a header): then draw that step.

## Kinds and zones

The viewer uses `kind=` for the icon and for the dotted trust-boundary lines between zones. `person` and `client` are the client zone, `external` is outside, and every other kind is our zone.

## Layers and side parts

| It is a layer (`@layer`, its own participant) | It is a side part (`@uses` on the step where it acts) |
|---|---|
| App, Routes, Middleware, Validator, Controller, Service, Repository, Serializer, DTO | A util, helper or library the layer calls in-process (`hashBody`, `psp-sdk`) |
| Every store, cache, queue, worker and event bus the flow crosses | Config, an env value, a constant, a feature flag |
| An external provider | A React or framework hook in the client |
| A cron, worker or listener that starts the flow | A cron that prepared the data, a migration, a test or a type that defines the shape |

Helpers are `util` and constants are `config`.

## Level of detail

- **Explain, Easy, Proposed and Scoped draw every layer on the path.** Easy changes only the wording. Scoped starts at the layer where the scope begins.
- **Compact** (only when the user asks for fewer steps or combined layers) may fold Routes through Repository into one `participant API as Backend`; say "Compact" in the title line.
- **Avoid keywords as aliases.** `end`, `alt`, `opt`, `loop`, `par`, `and`, `else`, `note`, `box` and `rect` break the parser.

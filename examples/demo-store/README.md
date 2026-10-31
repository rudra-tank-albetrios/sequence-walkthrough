# Demo store

The small, real project behind the Sequence Walkthrough demo flow **"Place an order"**. A newcomer opening the viewer sees true behaviour, and every code link in the demo diagram points at a file and line in this folder (`tools/check-refs` verifies them in CI).

It is a tiny shop with one flow: `POST /api/orders`. Everything runs in memory. The database, Redis, the event bus, the mail queue and the mailer are small stand-ins, so there is nothing to install or configure.

## Run it

From the repository root:

```sh
npm run demo -w @swv/demo-store
```

Open <http://127.0.0.1:8787/> for a one-paragraph description and a ready `curl` example. The only session token is `demo-token` (user `ada@example.com`). Product `p_3` has a stock of one, so ordering it twice shows the `409 Conflict` path. The worker and the cron run every second; the confirmation email is printed in the terminal.

Replies: `201 Created` with the order, `401 Unauthorized` without a valid token, `422 Unprocessable Entity` with a `fields` map for a bad body, `409 Conflict` when stock cannot be held.

Settings read from the environment: `PORT` (8787), `RESERVATION_TTL_SECONDS` (900), `CURRENCY` (INR), `SHOP_NAME`.

## Layers

| Layer       | Folder                                                            | Part                                                                    |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Pages       | `src/frontend/pages/`                                             | `renderCheckoutPage`, `submitCheckout`                                  |
| Components  | `src/frontend/components/`                                        | `renderCartSummary`, `renderOrderConfirmation`                          |
| Store       | `src/frontend/store/`                                             | `createCartStore`                                                       |
| API Client  | `src/frontend/api/`                                               | `ApiClient.placeOrder`                                                  |
| App         | `src/backend/app/`                                                | `createApp`, `handle(request)`                                          |
| Routes      | `src/backend/routes/`                                             | `registerOrderRoutes`, `Router`                                         |
| Middleware  | `src/backend/middleware/`                                         | `requireUser`, `requestId`                                              |
| Validator   | `src/backend/validators/`                                         | `validatePlaceOrder`, `placeOrderValidator`                             |
| Controller  | `src/backend/controllers/`                                        | `OrdersController.placeOrder`                                           |
| Service     | `src/backend/services/`                                           | `OrdersService.placeOrder`, `OutOfStockError`                           |
| Repository  | `src/backend/repositories/`                                       | `OrdersRepository`, `ProductsRepository`                                |
| Database    | `src/backend/infra/memoryDb.ts`                                   | tables `products`, `orders`, `order_items`, `sessions`; `transaction`   |
| Redis       | `src/backend/infra/memoryRedis.ts`                                | `reserve`, `del`, `release`, `expired`                                  |
| Event Bus   | `src/backend/infra/eventBus.ts`                                   | `publish`, `subscribe`                                                  |
| Mail Queue  | `src/backend/infra/memoryQueue.ts`                                | `enqueue`, `dequeue`                                                    |
| Mail Worker | `src/backend/workers/`                                            | `OrderConfirmationWorker.runOnce`                                       |
| Mail        | `src/backend/infra/mailer.ts`                                     | `send`                                                                  |
| Serializer  | `src/backend/serializers/`                                        | `serializeOrder`                                                        |
| DTO         | `src/backend/dto/`                                                | `PlaceOrderDto`, `OrderResponseDto`                                     |
| Side parts  | `src/backend/cron/`, `src/frontend/hooks/`, `src/backend/utils/`, `src/backend/config/` | `tick`, `useCart`, `sumLines`, `RESERVATION_TTL_SECONDS` |

## Tests

```sh
npx vitest run --project @swv/demo-store
```

The backend tests drive `app.handle` with web `Request`s; the frontend tests pass the same `app.handle` to the API client as its `fetch`, so checkout runs end to end without a network.

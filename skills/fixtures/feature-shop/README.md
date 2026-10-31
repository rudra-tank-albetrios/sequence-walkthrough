# Feature shop

Each feature keeps its own files in `src/features/<name>/`, named by what they do. `src/server.ts` mounts each feature's routes and holds the one error handler. `src/shared/` holds what several features use.

| File | What it does |
|---|---|
| `routes.ts` | The path, the middleware chain and the handler. |
| `schema.ts` | The zod schema of the request body. |
| `handler.ts` | Calls the logic and sends the success reply. |
| `logic.ts` | Business rules. |
| `store.ts` | The only code that writes SQL, through `src/shared/db.ts`. |
| `view.ts` | Picks the fields the client sees. |

## Placing an order: POST /v2/orders

Mounted in `src/server.ts`, declared in `src/features/orders/routes.ts`, as
`ordersRoutes.post('/', requireSession, parseBody(placeOrderSchema), placeOrderHandler)`.

1. `requireSession` (`src/features/auth/require-session.ts`) reads the `x-session` header and sets `customer`.
2. `parseBody(placeOrderSchema)` (`src/shared/parse-body.ts`) checks the body against `placeOrderSchema`.
3. `placeOrderHandler` calls `placeOrder(customer, body)`.
4. `placeOrder` calls `readStock(item)`, which runs `SELECT remaining, unit_price FROM stock WHERE item = ?`.
5. `placeOrder` then calls `insertOrder(...)`, which runs `INSERT INTO orders ... RETURNING *` with state `waiting`.
6. `placeOrderHandler` sends `toOrderView(order)` with status 201.

Request body: `item`, `count`.

| Status | Body | When | Raised by |
|---|---|---|---|
| 201 Created | `orderId`, `state`, `amountDue` | The order is placed. | `placeOrderHandler` |
| 401 Unauthorized | `problem: "No session"` | No session, or an unknown one. | `requireSession` |
| 422 Unprocessable Entity | `problem: "The order is not complete"` | The body is wrong. | `parseBody` |
| 409 Conflict | `problem: "Out of stock"` | The item is missing or short of stock. | `placeOrder` |

All error replies leave through the error handler in `src/server.ts`.

# Express shop

A small shop API. Every request runs through the same folders, in this order:

| Folder | What it does |
|---|---|
| `src/app.js` | Mounts the routers and holds the one error handler, which sends every error reply. |
| `src/routes/` | Maps a path and method to its middleware chain and controller. |
| `src/middleware/` | `authenticate` checks the token. `validate(schema)` checks the body. |
| `src/validators/` | The schemas `validate` runs. |
| `src/controllers/` | Calls the service and sends the success reply. |
| `src/services/` | Business rules. |
| `src/repositories/` | The only code that writes SQL, through `src/db.js`. |
| `src/serializers/` | Picks the fields the client sees. |

## Placing an order: POST /api/v1/orders

Mounted in `src/app.js`, declared in `src/routes/order.routes.js`, as
`router.post('/', authenticate, validate(createOrderSchema), OrderController.create)`.

1. `authenticate` reads the `Authorization: Bearer` header and calls `verifyToken` from `src/utils/token.js`. It sets `req.user`.
2. `validate(createOrderSchema)` runs `createOrderSchema.check(req.body)`.
3. `OrderController.create` calls `OrderService.place(req.user.id, req.body)`.
4. `OrderService.place` calls `OrderRepository.findProduct(productId)`, which runs `SELECT id, price, stock FROM products WHERE id = $1`.
5. `OrderService.place` then calls `OrderRepository.insert(...)`, which runs `INSERT INTO orders ... RETURNING *` with status `placed` and total `price * quantity`.
6. `OrderController.create` sends `serializeOrder(order)` with `res.status(201).json(...)`.

Request body: `productId`, `quantity`.

| Status | Body | When | Raised by |
|---|---|---|---|
| 201 Created | `id`, `status`, `total` | The order is placed. | `OrderController.create` |
| 401 Unauthorized | `error: "unauthorized"`, `message: "Missing or invalid token"` | No token, or an unknown one. | `authenticate` |
| 422 Unprocessable Entity | `error: "validation_failed"`, `message: "productId must be a whole number"` or `"quantity must be at least 1"` | The body is wrong. | `validate` |
| 409 Conflict | `error: "out_of_stock"`, `message: "Not enough stock"` | The product is missing or short of stock. | `OrderService.place` |

All error replies leave through the error handler in `src/app.js`.

## Arrows

- Client request: method and full path as the router sees it, `FE->>APP: POST /api/v1/orders`. External calls use the full URL.
- Keep real function and middleware names in labels: `RT->>MW: router.post("/", authenticate, validate(schema))`, `MW->>MW: authenticate()`, `MW->>CTRL: next() → OrderController.create()`, `CTRL->>SVC: OrderService.place()`, `REPO->>DB: INSERT INTO orders`. Skip a layer the code skips.
- Every HTTP call gets a dashed reply starting with status code and reason, then the message: `APP-->>FE: 422 Unprocessable Entity<br/>"amount must be positive"`. Replies to the client are drawn from the layer that received the request; the `@step` says which layer produced it and what the caller gets.
- Every error the code returns on the path appears, kept short: success first, then errors in code order.
- `alt`/`else`, `break` for early exits, `opt`, `loop`, `par`, named by the condition as the code tests it. Every block needs `end`. `-)` is fire-and-forget.
- Labels must not contain `;` or `#` (write `#59;`, `#35;`). Aliases must not be keywords.

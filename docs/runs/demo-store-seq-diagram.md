# Measured run: `seq-diagram` on `examples/demo-store`

Recorded on 2026-10-31 (plan 7.7 step 4). One sub agent (Claude Code's general-purpose agent, model `claude-fable-5-1`) was given exactly the built `tools/build-skills/dist/seq-diagram/SKILL.md` and the line "Diagram the place-order flow of the project at `examples/demo-store`", nothing else. Its reply follows unchanged; the numbers and the validator result are in `docs/decisions.md` under "Phase 5", and the per-file reading evidence came from `node tools/build-skills/src/run-evidence-cli.ts` on the sub agent's transcript.

**Place an order** · Explain · 58 steps, 20 layers

```mermaid
sequenceDiagram
    %% @spec walkthrough/2
    %% @title Place an order
    %% @trigger The shopper presses Place order on the checkout page
    %% @term hold: a Redis key with a TTL keeping units aside for one order
    %% @term minor units: money as whole paise, 619700 is ₹6197.00
    %% @term bearer token: Authorization header value naming a signed-in session
    %% @layer U kind=person The shopper, signed in
    %% @layer PG kind=client src/frontend/pages/CheckoutPage.ts
    %% @layer CMP kind=client src/frontend/components/
    %% @layer ST kind=client src/frontend/store/cartStore.ts
    %% @layer API kind=client src/frontend/api/client.ts
    %% @layer APP kind=app src/backend/app/app.ts
    %% @layer RT kind=router src/backend/routes/
    %% @layer MW kind=middleware src/backend/middleware/
    %% @layer VAL kind=validator src/backend/validators/placeOrder.validator.ts
    %% @layer CTL kind=controller src/backend/controllers/orders.controller.ts
    %% @layer SVC kind=service src/backend/services/orders.service.ts
    %% @layer REPO kind=repository src/backend/repositories/
    %% @layer DB kind=db src/backend/infra/memoryDb.ts in-memory tables
    %% @layer SER kind=serializer src/backend/serializers/order.serializer.ts
    %% @layer DTO kind=dto src/backend/dto/placeOrder.dto.ts
    %% @layer RD kind=cache src/backend/infra/memoryRedis.ts Redis stand-in
    %% @layer EB kind=eventbus src/backend/infra/eventBus.ts
    %% @layer Q kind=queue src/backend/infra/memoryQueue.ts
    %% @layer WK kind=worker src/backend/workers/orderConfirmation.worker.ts
    %% @layer MAIL kind=external src/backend/infra/mailer.ts mail stand-in
    autonumber
    actor U as Shopper
    participant PG as Pages
    participant CMP as Components
    participant ST as Store
    participant API as API Client
    participant APP as App
    participant RT as Routes
    participant MW as Middleware
    participant VAL as Validator
    participant CTL as Controller
    participant SVC as Service
    participant REPO as Repository
    participant DB as Database
    participant SER as Serializer
    participant DTO as DTO
    participant RD as Redis
    participant EB as Event Bus
    participant Q as Mail Queue
    participant WK as Mail Worker
    participant MAIL as Mail

    %% @section Check the request
    %% @summary Sign-in and body are checked before any work
    %% @step The submit button starts submitCheckout with the store, client and token.
    %% @uses hook useCart src/frontend/hooks/useCart.ts:14 adds, removes and totals cart lines before checkout
    %% @unconfirmed how the form submit event is wired to submitCheckout
    %% @ref src/frontend/pages/CheckoutPage.ts:44
    U->>PG: Click "Place order"
    %% @step The page reads the cart lines and the shipping address.
    %% @ref src/frontend/pages/CheckoutPage.ts:45
    PG->>ST: store.getState()
    %% @step The store hands back the current cart state.
    ST-->>PG: { items, address }
    %% @step The page marks the checkout as in progress before calling the API.
    %% @ref src/frontend/pages/CheckoutPage.ts:46
    PG->>ST: store.setState({ status: { kind: "submitting" } })
    %% @step Items shrink to productId and quantity, the address becomes shippingAddress.
    %% @payload.body { items: [{ productId, quantity }], shippingAddress: { line1, city, postcode } }
    %% @ref src/frontend/pages/CheckoutPage.ts:47
    PG->>API: ApiClient.placeOrder(body, token)
    %% @step The client posts JSON and adds the bearer header only when a token exists.
    %% @payload.headers content-type: application/json
    %% @payload.headers authorization: Bearer <token>
    %% @payload.body { items: [{ productId, quantity }], shippingAddress: { line1, city, postcode } }
    %% @ref src/frontend/api/client.ts:60
    API->>APP: POST /api/orders
    %% @step app.handle wraps the router so any thrown error becomes a 500.
    %% @ref src/backend/app/app.ts:81
    APP->>RT: router.dispatch(request)
    %% @step Exact method and path match, then global middleware before the route's own chain.
    %% @ref src/backend/routes/router.ts:40
    %% @ref src/backend/routes/orders.routes.ts:15
    RT->>MW: runChain(ctx, [requestId, requireUser(findSession), placeOrderValidator], controller.placeOrder)
    %% @step Reuses an incoming x-request-id or mints a UUID for the reply header.
    %% @ref src/backend/middleware/requestId.middleware.ts:7
    MW->>MW: requestId()
    %% @step Splits the Authorization header and rejects anything that is not Bearer plus token.
    %% @ref src/backend/middleware/auth.middleware.ts:14
    MW->>MW: requireUser() → userFromHeader(authorization)
    %% @step findSession from createApp looks the token up straight in the sessions table.
    %% @ref src/backend/app/app.ts:73
    MW->>DB: findSession(token) → db.sessions.findById(token)
    %% @step The session row is mapped to id and email, or undefined when unknown.
    %% @ref src/backend/app/app.ts:74
    DB-->>MW: { id, email } or undefined
    alt user found
        %% @step The user goes on ctx.user and the chain continues to the validator.
        %% @ref src/backend/middleware/auth.middleware.ts:17
        MW->>VAL: next() → placeOrderValidator
    else no Bearer token or unknown session
        %% @step requireUser ends the request before the body is even read.
        %% @payload.body { error }
        %% @ref src/backend/middleware/auth.middleware.ts:15
        APP-->>API: 401 Unauthorized<br/>"Sign in to place an order"
    end
    %% @step Parses the body, then checks every field so all problems report at once.
    %% @ref src/backend/validators/placeOrder.validator.ts:62
    VAL->>VAL: validatePlaceOrder(await readJson(request))
    alt result.ok
        %% @step Trimmed strings and whole-number quantities become the typed DTO on ctx.dto.
        %% @ref src/backend/validators/placeOrder.validator.ts:64
        %% @ref src/backend/dto/placeOrder.dto.ts:15
        VAL->>DTO: ctx.dto = PlaceOrderDto { items, shippingAddress }
        %% @step The validator calls the last link of the chain, the controller.
        %% @ref src/backend/validators/placeOrder.validator.ts:65
        VAL->>CTL: next() → OrdersController.placeOrder(ctx)
    else fields has errors
        %% @step Field paths such as items.0.quantity map to one message each.
        %% @payload.body { error, fields: { "items.0.quantity": "must be a whole number greater than 0" } }
        %% @ref src/backend/validators/placeOrder.validator.ts:63
        APP-->>API: 422 Unprocessable Entity<br/>"Order details are invalid"
    end

    %% @section Price the lines and hold stock
    %% @summary Each line is priced, then held in Redis
    %% @step The controller delegates and will map the outcome to a status code.
    %% @ref src/backend/controllers/orders.controller.ts:21
    CTL->>SVC: OrdersService.placeOrder(user, dto)
    loop priceItems for each line in dto.items
        %% @step Each line needs the product row for its name and unit price.
        %% @ref src/backend/services/orders.service.ts:105
        SVC->>REPO: ProductsRepository.findById(productId)
        %% @step The repository reads the products table directly.
        %% @ref src/backend/repositories/products.repository.ts:13
        REPO->>DB: products.findById(id)
        %% @step A Map lookup returns the row or undefined.
        DB-->>REPO: ProductRecord or undefined
        %% @step The row and the quantity pair up as a PricedItem.
        %% @ref src/backend/services/orders.service.ts:107
        REPO-->>SVC: product
        break product is undefined
            %% @step Pricing stops at the first unknown product id.
            %% @ref src/backend/services/orders.service.ts:106
            SVC-->>CTL: throw UnknownProductError(productId)
            %% @step The controller names the product id so the page can point at the line.
            %% @payload.body { error, productId }
            %% @ref src/backend/controllers/orders.controller.ts:28
            APP-->>API: 404 Not Found<br/>Product "{productId}" does not exist
        end
    end
    loop reserveStock for each priced line
        %% @step Units move from the stock counter into a per-order hold key with a TTL.
        %% @uses config reservationTtlSeconds src/backend/config/config.ts:18 RESERVATION_TTL_SECONDS, default 900 s
        %% @uses cron ReleaseExpiredReservationsCron.tick src/backend/cron/releaseExpiredReservations.cron.ts:13 returns expired holds to stock every second
        %% @unconfirmed exact key strings built by stockKey and holdKey in src/backend/infra/stockKeys.ts
        %% @ref src/backend/services/orders.service.ts:118
        %% @ref src/backend/infra/memoryRedis.ts:57
        SVC->>RD: redis.reserve(stockKey(productId), holdKey(orderId, productId), quantity, reservationTtlSeconds)
        alt available is at least quantity
            %% @step decrBy on the counter, then set the hold with the TTL, in one call.
            %% @ref src/backend/infra/memoryRedis.ts:60
            RD-->>SVC: true
        else stock short
            %% @step Nothing changes in Redis when the counter is below the quantity.
            %% @ref src/backend/infra/memoryRedis.ts:59
            RD-->>SVC: false
            %% @step Holds already taken for this order go back before the error is thrown.
            %% @ref src/backend/services/orders.service.ts:120
            %% @ref src/backend/infra/memoryRedis.ts:66
            SVC->>RD: redis.release(stockKey, holdKey, quantity) for each earlier held line
            %% @step The error carries the product so the reply can name it.
            %% @ref src/backend/services/orders.service.ts:121
            SVC-->>CTL: throw OutOfStockError(product)
            %% @step The controller maps the error to a conflict with the productId.
            %% @payload.body { error, productId }
            %% @ref src/backend/controllers/orders.controller.ts:25
            APP-->>API: 409 Conflict<br/>"{product.name}" is out of stock
        end
    end

    %% @section Save the order
    %% @summary One transaction, then the order.placed event
    %% @step Order numbers run SW-1001 upward from the orders table size.
    %% @ref src/backend/services/orders.service.ts:76
    SVC->>REPO: OrdersRepository.nextOrderNumber()
    %% @step The number is derived from the row count, not stored.
    %% @ref src/backend/repositories/orders.repository.ts:33
    REPO-->>SVC: "SW-" + (1001 + orders.size)
    %% @step The OrderRecord gets a UUID, status placed, config currency, sumLines total and placedAt.
    %% @uses util sumLines src/backend/utils/money.ts:24 unitPrice × quantity summed in minor units
    %% @uses config currency src/backend/config/config.ts:19 CURRENCY, default INR
    %% @field total sumLines(items), minor units
    %% @ref src/backend/services/orders.service.ts:86
    SVC->>REPO: OrdersRepository.insert(order, items)
    %% @step The order row and one row per line are written inside one transaction.
    %% @ref src/backend/repositories/orders.repository.ts:19
    %% @ref src/backend/infra/memoryDb.ts:62
    REPO->>DB: db.transaction(() => orders.insert(order), orderItems.insert(item) per line)
    alt every insert succeeds
        %% @step All tables commit and the inserted rows come back.
        %% @ref src/backend/infra/memoryDb.ts:66
        DB-->>REPO: { order, items }
        %% @step The repository returns the saved order with its items.
        REPO-->>SVC: OrderWithItems
    else an insert throws (duplicate id)
        %% @step Every table rolls back to its backup and the error is rethrown.
        %% @ref src/backend/infra/memoryDb.ts:69
        DB-->>REPO: rollback, rethrow
        %% @step With no order saved, the holds must not stay until the TTL runs out.
        %% @ref src/backend/services/orders.service.ts:89
        SVC->>RD: redis.release(stockKey, holdKey, quantity) for every line
        %% @step The service rethrows, the controller does not know this error and rethrows too.
        %% @ref src/backend/services/orders.service.ts:90
        %% @ref src/backend/controllers/orders.controller.ts:30
        SVC-->>CTL: rethrow
        %% @step app.handle logs the error and hides it behind a generic message.
        %% @payload.body { error }
        %% @ref src/backend/app/app.ts:84
        APP-->>API: 500 Internal Server Error<br/>"Something went wrong"
    end
    %% @step Subscribers run synchronously inside publish, but the request never waits on email.
    %% @payload.event { type: "order.placed", orderId, orderNumber, email, total, currency }
    %% @ref src/backend/services/orders.service.ts:92
    %% @ref src/backend/infra/eventBus.ts:29
    SVC->>EB: eventBus.publish(OrderPlacedEvent)
    %% @step The subscriber registered in createApp turns the event into a ConfirmationJob.
    %% @async the email itself is sent later by the worker
    %% @ref src/backend/app/app.ts:56
    %% @ref src/backend/workers/orderConfirmation.worker.ts:16
    EB->>Q: queue.enqueue(confirmationJob(event))
    %% @step The saved order and items go back to the controller.
    %% @ref src/backend/services/orders.service.ts:100
    SVC-->>CTL: OrderWithItems

    %% @section Reply to the shopper
    %% @summary Public order shape, 201, store update, confirmation
    %% @step The controller never returns records, only the serialized public shape.
    %% @ref src/backend/controllers/orders.controller.ts:22
    CTL->>SER: serializeOrder(placed)
    %% @step Internal ids and userId are dropped, lineTotal and totalDisplay are computed.
    %% @uses util formatMoney src/backend/utils/money.ts:16 619700 INR becomes ₹6197.00
    %% @ref src/backend/serializers/order.serializer.ts:7
    %% @ref src/backend/dto/placeOrder.dto.ts:30
    SER->>DTO: OrderResponseDto { orderNumber, status, currency, items, total, totalDisplay, shippingAddress, placedAt }
    %% @step The public order comes back to the controller.
    SER-->>CTL: OrderResponseDto
    %% @step The controller answers json(201), and requestId adds X-Request-Id on the way out.
    %% @payload.headers X-Request-Id: <uuid>
    %% @payload.body { orderNumber, status, currency, items: [{ productId, name, quantity, unitPrice, lineTotal }], total, totalDisplay, shippingAddress, placedAt }
    %% @ref src/backend/controllers/orders.controller.ts:22
    %% @ref src/backend/middleware/requestId.middleware.ts:10
    APP-->>API: 201 Created
    %% @step toResult maps 201 to placed, 401 unauthorized, 409 conflict, 422 invalid, else failed.
    %% @ref src/frontend/api/client.ts:67
    API-->>PG: PlaceOrderResult { kind: "placed", order }
    alt result.kind is placed
        %% @step The cart is emptied together with the status change.
        %% @ref src/frontend/pages/CheckoutPage.ts:55
        PG->>ST: store.setState({ status: { kind: "placed", order }, items: [] })
    else any other kind
        %% @step The message and the 422 field map are kept so every bad field can show.
        %% @ref src/frontend/pages/CheckoutPage.ts:40
        PG->>ST: store.setState({ status: { kind: "error", message, fields } })
    end
    %% @step renderCheckoutPage renders the status, a placed status becomes the confirmation.
    %% @unconfirmed who re-renders the page after submitCheckout resolves
    %% @ref src/frontend/pages/CheckoutPage.ts:16
    PG->>CMP: renderOrderConfirmation(order)
    %% @step Lines and totalDisplay are escaped into the thank-you block.
    %% @ref src/frontend/components/OrderConfirmation.ts:11
    CMP-->>PG: Thank you! Order {orderNumber} is placed.
    %% @step The shopper sees the confirmation and the email notice.
    %% @ref src/frontend/pages/CheckoutPage.ts:28
    PG-->>U: Checkout page with confirmation

    %% @section Send the email
    %% @summary Background: worker drains the queue, mailer sends
    %% @step server.ts runs worker.runOnce() every second, taking one job per tick.
    %% @ref src/backend/server.ts:70
    %% @ref src/backend/workers/orderConfirmation.worker.ts:38
    WK->>Q: queue.dequeue()
    %% @step First in, first out, undefined when empty ends the tick.
    %% @ref src/backend/infra/memoryQueue.ts:10
    Q-->>WK: ConfirmationJob { to, orderNumber, total, currency } or undefined
    %% @step Subject uses the shop name, the text the formatted total.
    %% @uses config shopName src/backend/config/config.ts:20 SHOP_NAME, default Sequence Walkthrough Demo Store
    %% @uses util formatMoney src/backend/utils/money.ts:16 total as currency text
    %% @payload.body { to, subject: "{shopName}: order {orderNumber} confirmed", text: "Thanks for your order {orderNumber}. Total: {total}. We will ship it soon." }
    %% @ref src/backend/workers/orderConfirmation.worker.ts:41
    WK->>MAIL: mailer.send(to, subject, text)
    %% @step The stand-in records the mail and the onMail sink prints it to the terminal.
    %% @ref src/backend/infra/mailer.ts:19
    %% @ref src/backend/server.ts:60
    MAIL-->>WK: SentMail
```

Not confirmed: how the "Place order" submit event is wired to `submitCheckout` and who re-renders the page afterwards (no event binding in `src/frontend/pages/CheckoutPage.ts`, tests call it directly); the exact key strings from `stockKey`/`holdKey` (`src/backend/infra/stockKeys.ts` not opened).

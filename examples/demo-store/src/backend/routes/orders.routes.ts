// Routes: POST /api/orders runs requireUser, then the validator, then the controller.
import { OrdersController } from '../controllers/orders.controller.ts';
import { requireUser, type SessionLookup } from '../middleware/auth.middleware.ts';
import type { OrdersService } from '../services/orders.service.ts';
import { placeOrderValidator } from '../validators/placeOrder.validator.ts';
import type { Router } from './router.ts';

export interface OrderRouteDeps {
  service: OrdersService;
  findSession: SessionLookup;
}

export function registerOrderRoutes(router: Router, deps: OrderRouteDeps): void {
  const controller = new OrdersController(deps.service);
  router.add('POST', '/api/orders', [requireUser(deps.findSession), placeOrderValidator], (ctx) =>
    controller.placeOrder(ctx),
  );
}

// Controller: calls the service and turns its outcome into an HTTP status and body.
import { json, type RequestContext } from '../app/http.ts';
import { serializeOrder } from '../serializers/order.serializer.ts';
import {
  type OrdersService,
  OutOfStockError,
  UnknownProductError,
} from '../services/orders.service.ts';

export class OrdersController {
  private readonly orders: OrdersService;

  constructor(orders: OrdersService) {
    this.orders = orders;
  }

  placeOrder(ctx: RequestContext): Response {
    const { user, dto } = ctx;
    if (!user || !dto) throw new Error('placeOrder needs requireUser and the validator before it');
    try {
      const placed = this.orders.placeOrder(user, dto);
      return json(201, serializeOrder(placed));
    } catch (error) {
      if (error instanceof OutOfStockError) {
        return json(409, { error: error.message, productId: error.productId });
      }
      if (error instanceof UnknownProductError) {
        return json(404, { error: error.message, productId: error.productId });
      }
      throw error;
    }
  }
}

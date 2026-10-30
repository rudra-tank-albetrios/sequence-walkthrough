// Serializer: the public shape of an order. Internal ids and the user id stay inside.
import type { OrderResponseDto } from '../dto/placeOrder.dto.ts';
import type { OrderWithItems } from '../repositories/orders.repository.ts';
import { formatMoney } from '../utils/money.ts';

export function serializeOrder({ order, items }: OrderWithItems): OrderResponseDto {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    items: items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice * item.quantity,
    })),
    total: order.total,
    totalDisplay: formatMoney(order.total, order.currency),
    shippingAddress: order.shippingAddress,
    placedAt: order.placedAt,
  };
}

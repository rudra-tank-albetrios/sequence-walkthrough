export function toOrderView(order: { id: number; state: string; due: number }) {
  return { orderId: order.id, state: order.state, amountDue: order.due };
}

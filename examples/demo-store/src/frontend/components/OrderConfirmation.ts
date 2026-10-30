// Component: what the customer sees once the order is placed.
import type { OrderResponseDto } from '../../backend/dto/placeOrder.dto.ts';
import { escapeHtml } from '../../backend/utils/html.ts';

export function renderOrderConfirmation(order: OrderResponseDto): string {
  const lines = order.items
    .map((line) => `<li>${escapeHtml(line.name)} × ${line.quantity}</li>`)
    .join('');
  return (
    `<section class="order-confirmation">` +
    `<h2>Thank you! Order ${escapeHtml(order.orderNumber)} is placed.</h2>` +
    `<ul>${lines}</ul>` +
    `<p>Total ${escapeHtml(order.totalDisplay)}. A confirmation email is on its way.</p>` +
    `</section>`
  );
}

// Component: the cart lines and their total.
import { formatMoney, sumLines } from '../../backend/utils/money.ts';
import type { CartItem } from '../store/cartStore.ts';
import { escapeHtml } from '../../backend/utils/html.ts';

export function renderCartSummary(items: readonly CartItem[], currency: string): string {
  if (items.length === 0) return '<p class="cart-empty">Your cart is empty.</p>';
  const rows = items
    .map(
      (item) =>
        `<li>${escapeHtml(item.name)} × ${item.quantity} — ` +
        `${formatMoney(item.unitPrice * item.quantity, currency)}</li>`,
    )
    .join('');
  const total = formatMoney(sumLines(items), currency);
  return `<section class="cart-summary"><ul>${rows}</ul><p class="cart-total">Total: ${total}</p></section>`;
}

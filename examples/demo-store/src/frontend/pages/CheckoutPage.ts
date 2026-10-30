// Page: renders the checkout from the store and drives "Place an order" through the API client.
import type { ApiClient, PlaceOrderResult } from '../api/client.ts';
import { renderCartSummary } from '../components/CartSummary.ts';
import { escapeHtml } from '../components/html.ts';
import { renderOrderConfirmation } from '../components/OrderConfirmation.ts';
import type { CartState, CheckoutStatus, Store } from '../store/cartStore.ts';

export interface CheckoutDeps {
  store: Store<CartState>;
  api: ApiClient;
  /** The session token, or null when nobody is signed in. */
  token: string | null;
}

function renderStatus(status: CheckoutStatus): string {
  if (status.kind === 'placed') return renderOrderConfirmation(status.order);
  if (status.kind === 'submitting') return '<p class="status">Placing your order…</p>';
  if (status.kind === 'error') {
    const fields = Object.entries(status.fields)
      .map(([path, message]) => `<li>${escapeHtml(path)} ${escapeHtml(message)}</li>`)
      .join('');
    const list = fields === '' ? '' : `<ul class="field-errors">${fields}</ul>`;
    return `<div class="error" role="alert"><p>${escapeHtml(status.message)}</p>${list}</div>`;
  }
  return '<button type="submit">Place order</button>';
}

export function renderCheckoutPage(state: CartState, currency: string): string {
  return (
    `<main class="checkout"><h1>Checkout</h1>` +
    renderCartSummary(state.items, currency) +
    renderStatus(state.status) +
    `</main>`
  );
}

function statusFrom(result: PlaceOrderResult): CheckoutStatus {
  if (result.kind === 'placed') return { kind: 'placed', order: result.order };
  const fields = result.kind === 'invalid' ? result.fields : {};
  return { kind: 'error', message: result.message, fields };
}

/** Reads the cart, calls the API and writes the outcome back to the store. */
export async function submitCheckout({ store, api, token }: CheckoutDeps): Promise<CartState> {
  const { items, address } = store.getState();
  store.setState({ status: { kind: 'submitting' } });
  const result = await api.placeOrder(
    {
      items: items.map(({ productId, quantity }) => ({ productId, quantity })),
      shippingAddress: address,
    },
    token,
  );
  const status = statusFrom(result);
  store.setState(status.kind === 'placed' ? { status, items: [] } : { status });
  return store.getState();
}

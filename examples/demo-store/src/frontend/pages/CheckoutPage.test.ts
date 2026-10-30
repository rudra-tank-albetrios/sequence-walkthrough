import { describe, expect, it } from 'vitest';

import { createApp } from '../../backend/app/app.ts';
import { DEMO_TOKEN, PRODUCTS } from '../../backend/seed.ts';
import { ApiClient } from '../api/client.ts';
import { useCart } from '../hooks/useCart.ts';
import { createCartStore } from '../store/cartStore.ts';
import { renderCheckoutPage, submitCheckout } from './CheckoutPage.ts';

const ADDRESS = { line1: '1 Lovelace Lane', city: 'Pune', postcode: '411001' };

function setup() {
  const app = createApp({ now: () => Date.UTC(2026, 0, 1) });
  const api = new ApiClient('http://demo.local', (request) => app.handle(request));
  const store = createCartStore({ address: ADDRESS });
  const cart = useCart(store);
  const [keyboard, cable] = PRODUCTS.map(({ id, name, unitPrice }) => ({
    productId: id,
    name,
    unitPrice,
  }));
  if (!keyboard || !cable) throw new Error('seed has fewer products than expected');
  cart.add(keyboard);
  cart.add(cable, 2);
  return { app, api, store, cart };
}

describe('CheckoutPage', () => {
  it('shows the cart and the total before checkout', () => {
    const { store, cart } = setup();
    expect(cart.total()).toBe(619700);
    const html = renderCheckoutPage(store.getState(), 'INR');
    expect(html).toContain('Mechanical keyboard × 1');
    expect(html).toContain('USB-C cable × 2');
    expect(html).toContain('Total: ₹6197.00');
    expect(html).toContain('Place order');
  });

  it('places the order end to end in memory and renders the confirmation', async () => {
    const { app, api, store } = setup();
    const state = await submitCheckout({ store, api, token: DEMO_TOKEN });
    expect(state.status.kind).toBe('placed');
    expect(state.items).toEqual([]);
    const html = renderCheckoutPage(state, 'INR');
    expect(html).toContain('Order SW-1001 is placed');
    expect(html).toContain('Total ₹6197.00');
    expect(app.db.orders.size).toBe(1);
  });

  it('renders the 422 messages when the address is missing', async () => {
    const { api, store } = setup();
    store.setState({ address: { line1: '', city: '', postcode: '' } });
    const state = await submitCheckout({ store, api, token: DEMO_TOKEN });
    expect(state.status).toEqual({
      kind: 'error',
      message: 'Order details are invalid',
      fields: {
        'shippingAddress.line1': 'must be a non-empty string',
        'shippingAddress.city': 'must be a non-empty string',
        'shippingAddress.postcode': 'must be a non-empty string',
      },
    });
    const html = renderCheckoutPage(state, 'INR');
    expect(html).toContain('role="alert"');
    expect(html).toContain('shippingAddress.city must be a non-empty string');
  });

  it('renders the sign-in message when there is no token', async () => {
    const { api, store } = setup();
    const state = await submitCheckout({ store, api, token: null });
    expect(state.status).toEqual({ kind: 'error', message: 'Sign in to place an order', fields: {} });
  });
});

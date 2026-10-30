// Hook: the cart actions a page uses, bound to the store.
import { sumLines } from '../../backend/utils/money.ts';
import type { CartItem, CartState, Store } from '../store/cartStore.ts';

type CartProduct = Omit<CartItem, 'quantity'>;

export interface CartActions {
  add(product: CartProduct, quantity?: number): void;
  remove(productId: string): void;
  /** The cart total in minor units. */
  total(): number;
}

export function useCart(store: Store<CartState>): CartActions {
  return {
    add(product, quantity = 1) {
      const { items } = store.getState();
      const existing = items.find((item) => item.productId === product.productId);
      store.setState({
        items: existing
          ? items.map((item) =>
              item === existing ? { ...item, quantity: item.quantity + quantity } : item,
            )
          : [...items, { ...product, quantity }],
      });
    },
    remove(productId) {
      store.setState({
        items: store.getState().items.filter((item) => item.productId !== productId),
      });
    },
    total() {
      return sumLines(store.getState().items);
    },
  };
}

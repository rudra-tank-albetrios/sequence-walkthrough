// Store: a tiny observable store holding the cart, the address and the checkout status.
import type { OrderResponseDto, ShippingAddressDto } from '../../backend/dto/placeOrder.dto.ts';

export interface CartItem {
  productId: string;
  name: string;
  /** Minor units (paise for INR). */
  unitPrice: number;
  quantity: number;
}

export type CheckoutStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'placed'; order: OrderResponseDto }
  | { kind: 'error'; message: string; fields: Record<string, string> };

export interface CartState {
  items: CartItem[];
  address: ShippingAddressDto;
  status: CheckoutStatus;
}

export interface Store<S> {
  getState(): S;
  setState(patch: Partial<S>): void;
  subscribe(listener: (state: S) => void): () => void;
}

function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<(state: S) => void>();
  return {
    getState: () => state,
    setState(patch) {
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const EMPTY_ADDRESS: ShippingAddressDto = { line1: '', city: '', postcode: '' };

export function createCartStore(initial: Partial<CartState> = {}): Store<CartState> {
  return createStore<CartState>({
    items: [],
    address: EMPTY_ADDRESS,
    status: { kind: 'idle' },
    ...initial,
  });
}

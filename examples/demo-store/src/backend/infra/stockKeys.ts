// The Redis key layout for stock: one counter per product, one hold per order line.

export const HOLD_PREFIX = 'hold:';

export function stockKey(productId: string): string {
  return `stock:${productId}`;
}

export function holdKey(orderId: string, productId: string): string {
  return `${HOLD_PREFIX}${orderId}:${productId}`;
}

/** Reads the product id back out of a hold key (order ids contain no colons). */
export function productIdFromHoldKey(key: string): string | undefined {
  return key.split(':')[2];
}

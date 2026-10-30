// Database tables of the demo store. The id of a session row is its bearer token.

export interface Row {
  readonly id: string;
}

export interface ProductRecord extends Row {
  name: string;
  /** Minor units (paise for INR). */
  unitPrice: number;
  /** Catalogue stock at seed time; the live counter lives in Redis. */
  stock: number;
}

export interface SessionRecord extends Row {
  userId: string;
  email: string;
}

interface AddressRecord {
  line1: string;
  city: string;
  postcode: string;
}

export interface OrderRecord extends Row {
  orderNumber: string;
  userId: string;
  status: 'placed';
  currency: string;
  total: number;
  shippingAddress: AddressRecord;
  placedAt: string;
}

export interface OrderItemRecord extends Row {
  orderId: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

// DTO: the shapes that cross the HTTP boundary for "Place an order".

export interface OrderItemDto {
  productId: string;
  quantity: number;
}

export interface ShippingAddressDto {
  line1: string;
  city: string;
  postcode: string;
}

/** Request body of POST /api/orders. */
export interface PlaceOrderDto {
  items: OrderItemDto[];
  shippingAddress: ShippingAddressDto;
}

interface OrderLineDto {
  productId: string;
  name: string;
  quantity: number;
  /** Minor units (paise for INR). */
  unitPrice: number;
  lineTotal: number;
}

/** Response body of a 201 Created. No internal ids or user ids. */
export interface OrderResponseDto {
  orderNumber: string;
  status: 'placed';
  currency: string;
  items: OrderLineDto[];
  total: number;
  totalDisplay: string;
  shippingAddress: ShippingAddressDto;
  placedAt: string;
}

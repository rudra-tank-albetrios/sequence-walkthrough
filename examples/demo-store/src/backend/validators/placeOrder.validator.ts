// Validator: hand-written checks on the request body. Every problem is reported at once.
import { json, type Middleware } from '../app/http.ts';
import type { OrderItemDto, PlaceOrderDto, ShippingAddressDto } from '../dto/placeOrder.dto.ts';
import { isList, isNonEmptyString, isPositiveInteger, isRecord } from '../utils/guards.ts';

/** Field path → message, for example "items.0.quantity" → "must be a whole number greater than 0". */
type FieldErrors = Record<string, string>;

type ValidationResult = { ok: true; dto: PlaceOrderDto } | { ok: false; fields: FieldErrors };

function requireString(value: unknown, path: string, fields: FieldErrors): string {
  if (isNonEmptyString(value)) return value.trim();
  fields[path] = 'must be a non-empty string';
  return '';
}

function validateItem(entry: unknown, index: number, fields: FieldErrors): OrderItemDto {
  const item = isRecord(entry) ? entry : {};
  const productId = requireString(item.productId, `items.${index}.productId`, fields);
  if (isPositiveInteger(item.quantity)) return { productId, quantity: item.quantity };
  fields[`items.${index}.quantity`] = 'must be a whole number greater than 0';
  return { productId, quantity: 0 };
}

function validateItems(value: unknown, fields: FieldErrors): OrderItemDto[] {
  if (!isList(value) || value.length === 0) {
    fields.items = 'must be a non-empty list';
    return [];
  }
  return value.map((entry, index) => validateItem(entry, index, fields));
}

function validateAddress(value: unknown, fields: FieldErrors): ShippingAddressDto {
  const address = isRecord(value) ? value : {};
  if (!isRecord(value)) fields.shippingAddress = 'is required';
  return {
    line1: requireString(address.line1, 'shippingAddress.line1', fields),
    city: requireString(address.city, 'shippingAddress.city', fields),
    postcode: requireString(address.postcode, 'shippingAddress.postcode', fields),
  };
}

function validatePlaceOrder(body: unknown): ValidationResult {
  if (!isRecord(body)) return { ok: false, fields: { body: 'must be a JSON object' } };
  const fields: FieldErrors = {};
  const items = validateItems(body.items, fields);
  const shippingAddress = validateAddress(body.shippingAddress, fields);
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, dto: { items, shippingAddress } };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Parses and validates the body; a bad body ends the request with 422 and the field list. */
export const placeOrderValidator: Middleware = async (ctx, next) => {
  const result = validatePlaceOrder(await readJson(ctx.request));
  if (!result.ok) return json(422, { error: 'Order details are invalid', fields: result.fields });
  ctx.dto = result.dto;
  return next();
};

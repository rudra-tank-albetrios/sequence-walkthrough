// API Client: the one place the frontend talks HTTP. The fetch is injectable, so tests pass
// the backend's app.handle and run end to end in memory.
import type { OrderResponseDto, PlaceOrderDto } from '../../backend/dto/placeOrder.dto.ts';
import { isRecord } from '../../backend/utils/guards.ts';

export type FetchLike = (request: Request) => Promise<Response>;

export type PlaceOrderResult =
  | { kind: 'placed'; order: OrderResponseDto }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'invalid'; message: string; fields: Record<string, string> }
  | { kind: 'failed'; status: number; message: string };

function fieldsOf(payload: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!isRecord(payload) || !isRecord(payload.fields)) return fields;
  for (const [path, message] of Object.entries(payload.fields)) {
    if (typeof message === 'string') fields[path] = message;
  }
  return fields;
}

function toResult(status: number, payload: unknown): PlaceOrderResult {
  if (status === 201 && isRecord(payload) && typeof payload.orderNumber === 'string') {
    return { kind: 'placed', order: payload as unknown as OrderResponseDto };
  }
  const message =
    isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : `Request failed with status ${status}`;
  if (status === 401) return { kind: 'unauthorized', message };
  if (status === 409) return { kind: 'conflict', message };
  if (status === 422) return { kind: 'invalid', message, fields: fieldsOf(payload) };
  return { kind: 'failed', status, message };
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(baseUrl: string, fetchImpl: FetchLike = (request) => fetch(request)) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  async placeOrder(body: PlaceOrderDto, token: string | null): Promise<PlaceOrderResult> {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (token !== null) headers.set('authorization', `Bearer ${token}`);
    const response = await this.fetchImpl(
      new Request(`${this.baseUrl}/api/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    );
    const payload: unknown = await response.json().catch(() => null);
    return toResult(response.status, payload);
  }
}

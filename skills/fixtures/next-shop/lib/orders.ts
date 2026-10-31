import { query } from './db';

export class SoldOutError extends Error {}

export async function createOrder(code: string, units: number): Promise<{ id: string; phase: string }> {
  const [stock] = await query('SELECT left_count FROM stock WHERE code = $1', [code]);
  if (!stock || stock.left_count < units) {
    throw new SoldOutError(code);
  }
  const [order] = await query(
    'INSERT INTO orders (code, units, phase) VALUES ($1, $2, $3) RETURNING id, phase',
    [code, units, 'new'],
  );
  return order;
}

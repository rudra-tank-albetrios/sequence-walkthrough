// Seed data: three products (one with a single unit, so a second order conflicts) and one session.
import type { MemoryDb } from './infra/memoryDb.ts';
import type { MemoryRedis } from './infra/memoryRedis.ts';
import type { ProductRecord } from './infra/schema.ts';
import { stockKey } from './infra/stockKeys.ts';
import { toMinorUnits } from './utils/money.ts';

export const DEMO_TOKEN = 'demo-token';
const DEMO_USER = { id: 'u_1', email: 'ada@example.com' };

export const PRODUCTS: ProductRecord[] = [
  { id: 'p_1', name: 'Mechanical keyboard', unitPrice: toMinorUnits(4999), stock: 10 },
  { id: 'p_2', name: 'USB-C cable', unitPrice: toMinorUnits(599), stock: 25 },
  { id: 'p_3', name: 'Limited edition poster', unitPrice: toMinorUnits(1299), stock: 1 },
];

export function seed(db: MemoryDb, redis: MemoryRedis): void {
  for (const product of PRODUCTS) {
    db.products.insert(product);
    redis.set(stockKey(product.id), product.stock);
  }
  db.sessions.insert({ id: DEMO_TOKEN, userId: DEMO_USER.id, email: DEMO_USER.email });
}

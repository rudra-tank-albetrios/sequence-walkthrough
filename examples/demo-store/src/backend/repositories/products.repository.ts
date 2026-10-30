// Repository: reads on the products table.
import type { MemoryDb } from '../infra/memoryDb.ts';
import type { ProductRecord } from '../infra/schema.ts';

export class ProductsRepository {
  private readonly db: MemoryDb;

  constructor(db: MemoryDb) {
    this.db = db;
  }

  findById(id: string): ProductRecord | undefined {
    return this.db.products.findById(id);
  }
}

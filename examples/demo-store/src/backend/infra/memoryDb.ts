// Database stand-in: tables are Maps, a transaction rolls every table back when fn throws.
import type { OrderItemRecord, OrderRecord, ProductRecord, Row, SessionRecord } from './schema.ts';

interface Snapshottable {
  snapshot(): () => void;
}

class Table<T extends Row> implements Snapshottable {
  private rows = new Map<string, T>();

  insert(row: T): T {
    if (this.rows.has(row.id)) throw new Error(`Duplicate id "${row.id}"`);
    this.rows.set(row.id, row);
    return row;
  }

  findById(id: string): T | undefined {
    return this.rows.get(id);
  }

  findMany(where: (row: T) => boolean): T[] {
    return [...this.rows.values()].filter(where);
  }

  get size(): number {
    return this.rows.size;
  }

  /** Copies the rows and returns a function that puts the copy back. */
  snapshot(): () => void {
    const copy = new Map(this.rows);
    return () => {
      this.rows = copy;
    };
  }
}

export class MemoryDb {
  readonly products = new Table<ProductRecord>();
  readonly orders = new Table<OrderRecord>();
  readonly orderItems = new Table<OrderItemRecord>();
  readonly sessions = new Table<SessionRecord>();

  private get tables(): Snapshottable[] {
    return [this.products, this.orders, this.orderItems, this.sessions];
  }

  /** Runs fn; if it throws, every table is restored to how it was before. */
  transaction<T>(fn: () => T): T {
    const restores = this.tables.map((table) => table.snapshot());
    try {
      return fn();
    } catch (error) {
      for (const restore of restores) restore();
      throw error;
    }
  }
}

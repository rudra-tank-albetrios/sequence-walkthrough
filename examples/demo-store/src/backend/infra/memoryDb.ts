// Database stand-in: tables are Maps, a transaction rolls every table back when fn throws.
import type { OrderItemRecord, OrderRecord, ProductRecord, Row, SessionRecord } from './schema.ts';

interface Transactional {
  begin(): void;
  commit(): void;
  rollback(): void;
}

class Table<T extends Row> implements Transactional {
  private rows = new Map<string, T>();
  /** The rows as they were when the open transaction began; copied on the first write only. */
  private backup: Map<string, T> | null = null;
  private inTransaction = false;

  insert(row: T): T {
    if (this.rows.has(row.id)) throw new Error(`Duplicate id "${row.id}"`);
    if (this.inTransaction && !this.backup) this.backup = new Map(this.rows);
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

  begin(): void {
    this.inTransaction = true;
    this.backup = null;
  }

  commit(): void {
    this.inTransaction = false;
    this.backup = null;
  }

  rollback(): void {
    if (this.backup) this.rows = this.backup;
    this.commit();
  }
}

export class MemoryDb {
  readonly products = new Table<ProductRecord>();
  readonly orders = new Table<OrderRecord>();
  readonly orderItems = new Table<OrderItemRecord>();
  readonly sessions = new Table<SessionRecord>();

  private get tables(): Transactional[] {
    return [this.products, this.orders, this.orderItems, this.sessions];
  }

  /** Runs fn; if it throws, every table it wrote to is restored to how it was before. */
  transaction<T>(fn: () => T): T {
    for (const table of this.tables) table.begin();
    try {
      const result = fn();
      for (const table of this.tables) table.commit();
      return result;
    } catch (error) {
      for (const table of this.tables) table.rollback();
      throw error;
    }
  }
}

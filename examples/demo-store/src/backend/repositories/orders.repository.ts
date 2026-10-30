// Repository: writes and reads on the orders and order_items tables.
import type { MemoryDb } from '../infra/memoryDb.ts';
import type { OrderItemRecord, OrderRecord } from '../infra/schema.ts';

export interface OrderWithItems {
  order: OrderRecord;
  items: OrderItemRecord[];
}

export class OrdersRepository {
  private readonly db: MemoryDb;

  constructor(db: MemoryDb) {
    this.db = db;
  }

  /** Writes the order and its lines together: either all rows land or none do. */
  insert(order: OrderRecord, items: OrderItemRecord[]): OrderWithItems {
    return this.db.transaction(() => {
      this.db.orders.insert(order);
      return { order, items: items.map((item) => this.db.orderItems.insert(item)) };
    });
  }

  findById(id: string): OrderWithItems | undefined {
    const order = this.db.orders.findById(id);
    if (!order) return undefined;
    return { order, items: this.db.orderItems.findMany((item) => item.orderId === id) };
  }

  /** Order numbers run SW-1001, SW-1002, … in the order they were placed. */
  nextOrderNumber(): string {
    return `SW-${1001 + this.db.orders.size}`;
  }
}

// Service: the business rules of placing an order. Price, hold stock, save, announce.
import { randomUUID } from 'node:crypto';

import type { AuthUser } from '../app/http.ts';
import type { Config } from '../config/config.ts';
import type { OrderItemDto, PlaceOrderDto } from '../dto/placeOrder.dto.ts';
import type { EventBus } from '../infra/eventBus.ts';
import type { MemoryRedis } from '../infra/memoryRedis.ts';
import type { OrderItemRecord, OrderRecord, ProductRecord } from '../infra/schema.ts';
import { holdKey, stockKey } from '../infra/stockKeys.ts';
import type { OrdersRepository, OrderWithItems } from '../repositories/orders.repository.ts';
import type { ProductsRepository } from '../repositories/products.repository.ts';
import { sumLines } from '../utils/money.ts';

export class OutOfStockError extends Error {
  readonly productId: string;

  constructor(product: ProductRecord) {
    super(`"${product.name}" is out of stock`);
    this.name = 'OutOfStockError';
    this.productId = product.id;
  }
}

export class UnknownProductError extends Error {
  readonly productId: string;

  constructor(productId: string) {
    super(`Product "${productId}" does not exist`);
    this.name = 'UnknownProductError';
    this.productId = productId;
  }
}

export interface OrdersServiceDeps {
  products: ProductsRepository;
  orders: OrdersRepository;
  redis: MemoryRedis;
  eventBus: EventBus;
  config: Config;
  now: () => number;
}

interface PricedItem {
  product: ProductRecord;
  quantity: number;
}

function toItemRecord(orderId: string, index: number, { product, quantity }: PricedItem): OrderItemRecord {
  return {
    id: `${orderId}-${index}`,
    orderId,
    productId: product.id,
    name: product.name,
    unitPrice: product.unitPrice,
    quantity,
  };
}

export class OrdersService {
  private readonly deps: OrdersServiceDeps;

  constructor(deps: OrdersServiceDeps) {
    this.deps = deps;
  }

  /** Prices the cart, holds the stock in Redis, saves the order and publishes order.placed. */
  placeOrder(user: AuthUser, dto: PlaceOrderDto): OrderWithItems {
    const { orders, eventBus, config, now } = this.deps;
    const priced = this.priceItems(dto.items);
    const orderId = randomUUID();
    this.reserveStock(orderId, priced);
    const items = priced.map((item, index) => toItemRecord(orderId, index, item));
    const order: OrderRecord = {
      id: orderId,
      orderNumber: orders.nextOrderNumber(),
      userId: user.id,
      status: 'placed',
      currency: config.currency,
      total: sumLines(items),
      shippingAddress: dto.shippingAddress,
      placedAt: new Date(now()).toISOString(),
    };
    const saved = orders.insert(order, items);
    eventBus.publish({
      type: 'order.placed',
      orderId,
      orderNumber: order.orderNumber,
      email: user.email,
      total: order.total,
      currency: order.currency,
    });
    return saved;
  }

  private priceItems(items: OrderItemDto[]): PricedItem[] {
    return items.map(({ productId, quantity }) => {
      const product = this.deps.products.findById(productId);
      if (!product) throw new UnknownProductError(productId);
      return { product, quantity };
    });
  }

  /** Holds every line in Redis. If one line cannot be held, the earlier holds are given back. */
  private reserveStock(orderId: string, items: PricedItem[]): void {
    const { redis, config } = this.deps;
    const held: PricedItem[] = [];
    for (const item of items) {
      const key = stockKey(item.product.id);
      const hold = holdKey(orderId, item.product.id);
      const reserved = redis.reserve(key, hold, item.quantity, config.reservationTtlSeconds);
      if (!reserved) {
        for (const h of held) redis.release(stockKey(h.product.id), holdKey(orderId, h.product.id), h.quantity);
        throw new OutOfStockError(item.product);
      }
      held.push(item);
    }
  }
}

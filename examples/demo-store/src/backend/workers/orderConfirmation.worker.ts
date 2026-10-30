// Mail Worker: takes one confirmation job off the queue and sends the email.
import type { Config } from '../config/config.ts';
import type { OrderPlacedEvent } from '../infra/eventBus.ts';
import type { Mailer } from '../infra/mailer.ts';
import type { MemoryQueue } from '../infra/memoryQueue.ts';
import { formatMoney } from '../utils/money.ts';

export interface ConfirmationJob {
  to: string;
  orderNumber: string;
  total: number;
  currency: string;
}

/** The job the event bus puts on the queue when an order is placed. */
export function confirmationJob(event: OrderPlacedEvent): ConfirmationJob {
  return {
    to: event.email,
    orderNumber: event.orderNumber,
    total: event.total,
    currency: event.currency,
  };
}

export class OrderConfirmationWorker {
  private readonly queue: MemoryQueue<ConfirmationJob>;
  private readonly mailer: Mailer;
  private readonly config: Config;

  constructor(queue: MemoryQueue<ConfirmationJob>, mailer: Mailer, config: Config) {
    this.queue = queue;
    this.mailer = mailer;
    this.config = config;
  }

  /** Handles one job. Returns false when the queue was empty. */
  runOnce(): boolean {
    const job = this.queue.dequeue();
    if (!job) return false;
    const total = formatMoney(job.total, job.currency);
    this.mailer.send(
      job.to,
      `${this.config.shopName}: order ${job.orderNumber} confirmed`,
      `Thanks for your order ${job.orderNumber}. Total: ${total}. We will ship it soon.`,
    );
    return true;
  }
}

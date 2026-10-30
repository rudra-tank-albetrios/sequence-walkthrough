// App: builds the in-memory infrastructure, wires the layers and exposes handle(request).
import { type Config, loadConfig } from '../config/config.ts';
import { ReleaseExpiredReservationsCron } from '../cron/releaseExpiredReservations.cron.ts';
import { EventBus } from '../infra/eventBus.ts';
import { Mailer, type MailSink } from '../infra/mailer.ts';
import { MemoryDb } from '../infra/memoryDb.ts';
import { MemoryQueue } from '../infra/memoryQueue.ts';
import { MemoryRedis } from '../infra/memoryRedis.ts';
import { requestId } from '../middleware/requestId.middleware.ts';
import { OrdersRepository } from '../repositories/orders.repository.ts';
import { ProductsRepository } from '../repositories/products.repository.ts';
import { registerOrderRoutes } from '../routes/orders.routes.ts';
import { Router } from '../routes/router.ts';
import { seed } from '../seed.ts';
import { OrdersService } from '../services/orders.service.ts';
import {
  type ConfirmationJob,
  confirmationJob,
  OrderConfirmationWorker,
} from '../workers/orderConfirmation.worker.ts';
import { json } from './http.ts';

export interface AppOptions {
  env?: NodeJS.ProcessEnv;
  /** The clock, in ms since epoch. Tests pass a fixed one. */
  now?: () => number;
  /** Sees every email the mail stand-in "sends". */
  onMail?: MailSink;
}

export interface App {
  handle(request: Request): Promise<Response>;
  config: Config;
  db: MemoryDb;
  redis: MemoryRedis;
  eventBus: EventBus;
  queue: MemoryQueue<ConfirmationJob>;
  mailer: Mailer;
  worker: OrderConfirmationWorker;
  cron: ReleaseExpiredReservationsCron;
}

export function createApp(options: AppOptions = {}): App {
  const config = loadConfig(options.env);
  const now = options.now ?? (() => Date.now());

  const db = new MemoryDb();
  const redis = new MemoryRedis(now);
  const eventBus = new EventBus();
  const queue = new MemoryQueue<ConfirmationJob>();
  const mailer = new Mailer(options.onMail);
  seed(db, redis);

  // Background work: an order.placed event becomes a confirmation job for the mail worker.
  eventBus.subscribe('order.placed', (event) => {
    queue.enqueue(confirmationJob(event));
  });

  const service = new OrdersService({
    products: new ProductsRepository(db),
    orders: new OrdersRepository(db),
    redis,
    eventBus,
    config,
    now,
  });

  const router = new Router();
  router.use(requestId);
  registerOrderRoutes(router, {
    service,
    findSession: (token) => {
      const session = db.sessions.findById(token);
      return session ? { id: session.userId, email: session.email } : undefined;
    },
  });

  return {
    async handle(request) {
      try {
        return await router.dispatch(request);
      } catch (error) {
        console.error(error);
        return json(500, { error: 'Something went wrong' });
      }
    },
    config,
    db,
    redis,
    eventBus,
    queue,
    mailer,
    worker: new OrderConfirmationWorker(queue, mailer, config),
    cron: new ReleaseExpiredReservationsCron(redis),
  };
}

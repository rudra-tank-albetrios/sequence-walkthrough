import { Hono } from 'hono';

import { requireSession } from '../auth/require-session.ts';
import { parseBody } from '../../shared/parse-body.ts';
import { placeOrderHandler } from './handler.ts';
import { placeOrderSchema } from './schema.ts';

export const ordersRoutes = new Hono();

ordersRoutes.post('/', requireSession, parseBody(placeOrderSchema), placeOrderHandler);

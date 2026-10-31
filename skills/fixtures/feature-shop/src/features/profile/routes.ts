import { Hono } from 'hono';

// The customer profile. Not part of placing an order.
export const profileRoutes = new Hono();

profileRoutes.get('/', (c) => c.json({ name: 'Ana' }));

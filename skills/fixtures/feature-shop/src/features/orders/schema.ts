import { z } from 'zod';

export const placeOrderSchema = z.object({
  item: z.string(),
  count: z.number().int().min(1),
});

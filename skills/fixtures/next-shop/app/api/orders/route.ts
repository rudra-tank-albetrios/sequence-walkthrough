import { NextResponse } from 'next/server';
import { z } from 'zod';

import { SoldOutError, createOrder } from '../../../lib/orders';

const newOrder = z.object({ code: z.string(), units: z.number().int().min(1) });

export async function POST(request: Request) {
  const parsed = newOrder.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the order form' }, { status: 400 });
  }
  try {
    const order = await createOrder(parsed.data.code, parsed.data.units);
    return NextResponse.json({ number: order.id, phase: order.phase }, { status: 201 });
  } catch (error) {
    if (error instanceof SoldOutError) {
      return NextResponse.json({ error: 'That item just sold out' }, { status: 409 });
    }
    throw error;
  }
}

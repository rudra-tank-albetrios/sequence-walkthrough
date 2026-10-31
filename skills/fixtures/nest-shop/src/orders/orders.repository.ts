import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findItem(sku: string) {
    return this.prisma.item.findUnique({ where: { sku } });
  }

  create(userId: string, sku: string, qty: number, amount: number) {
    return this.prisma.order.create({ data: { userId, sku, qty, amount, state: 'open' } });
  }
}

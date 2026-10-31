import { ConflictException, Injectable } from '@nestjs/common';

import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(private readonly repository: OrdersRepository) {}

  async place(userId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
    const item = await this.repository.findItem(dto.sku);
    if (!item || item.stock < dto.qty) {
      throw new ConflictException('Sold out');
    }
    const order = await this.repository.create(userId, dto.sku, dto.qty, item.price * dto.qty);
    return OrderResponseDto.from(order);
  }
}

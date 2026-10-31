import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  create(@Req() req: { user: { id: string } }, @Body() dto: CreateOrderDto): Promise<OrderResponseDto> {
    return this.orders.place(req.user.id, dto);
  }
}

import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { OrdersModule } from './orders/orders.module';

@Module({ imports: [AuthModule, OrdersModule, BillingModule] })
export class AppModule {}

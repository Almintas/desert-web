import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { OrdersModule } from '../orders/orders.module';
import { SaleWindowsModule } from '../sale-windows/sale-windows.module';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';

@Module({
  imports: [
    OrdersModule, // Order modelis
    SaleWindowsModule, // SaleWindow modelis
    AdminAuthModule,
  ],
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService],
})
export class AdminOrdersModule {}

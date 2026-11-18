import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { CountersModule } from '../counters/counters.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { SaleWindowsModule } from '../sale-windows/sale-windows.module';
import { AdminSaleWindowsController } from './admin-sale-windows.controller';
import { AdminSaleWindowsService } from './admin-sale-windows.service';

@Module({
  imports: [
    ProductsModule, // Product modelis
    SaleWindowsModule, // SaleWindow modelis
    OrdersModule, // Order modelis
    CountersModule,
    AdminAuthModule,
  ],
  controllers: [AdminSaleWindowsController],
  providers: [AdminSaleWindowsService],
})
export class AdminSaleWindowsModule {}

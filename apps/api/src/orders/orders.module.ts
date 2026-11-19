import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CountersModule } from '../counters/counters.module';
import { ProductsModule } from '../products/products.module';
import { SaleWindowsModule } from '../sale-windows/sale-windows.module';
import { TurnstileModule } from '../turnstile/turnstile.module';
import { Order, OrderSchema } from './order.schema';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    ProductsModule, // eksportuoja Product modelį
    SaleWindowsModule, // eksportuoja SaleWindow modelį
    CountersModule,
    TurnstileModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [MongooseModule], // Order modelis (admin langų valdymui)
})
export class OrdersModule {}

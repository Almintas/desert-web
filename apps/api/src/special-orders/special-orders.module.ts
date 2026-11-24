import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CountersModule } from '../counters/counters.module';
import { ProductsModule } from '../products/products.module';
import { SettingsModule } from '../settings/settings.module';
import { TurnstileModule } from '../turnstile/turnstile.module';
import { SpecialOrder, SpecialOrderSchema } from './special-order.schema';
import { SpecialOrdersController } from './special-orders.controller';
import { SpecialOrdersService } from './special-orders.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SpecialOrder.name, schema: SpecialOrderSchema }]),
    ProductsModule, // Product modelis
    SettingsModule,
    CountersModule,
    TurnstileModule,
  ],
  controllers: [SpecialOrdersController],
  providers: [SpecialOrdersService],
  exports: [MongooseModule], // SpecialOrder modelis (admin valdymui)
})
export class SpecialOrdersModule {}

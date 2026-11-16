import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsModule } from '../products/products.module';
import { SaleWindow, SaleWindowSchema } from './sale-window.schema';
import { SaleWindowsController } from './sale-windows.controller';
import { SaleWindowsService } from './sale-windows.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SaleWindow.name, schema: SaleWindowSchema }]),
    ProductsModule, // eksportuoja Product modelį
  ],
  controllers: [SaleWindowsController],
  providers: [SaleWindowsService],
})
export class SaleWindowsModule {}

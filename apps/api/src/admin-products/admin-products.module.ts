import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ProductsModule } from '../products/products.module';
import { SaleWindowsModule } from '../sale-windows/sale-windows.module';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';

/**
 * Produktų valdymas adminui. Atskiras modulis, nes reikia ir SaleWindow modelio
 * (SaleWindowsModule pats importuoja ProductsModule, todėl ProductsModule jo importuoti negali).
 */
@Module({
  imports: [
    ProductsModule, // eksportuoja Product modelį
    SaleWindowsModule, // eksportuoja SaleWindow modelį
    AdminAuthModule,
  ],
  controllers: [AdminProductsController],
  providers: [AdminProductsService],
})
export class AdminProductsModule {}

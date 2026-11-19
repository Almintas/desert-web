import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AdminOrdersModule } from './admin-orders/admin-orders.module';
import { AdminProductsModule } from './admin-products/admin-products.module';
import { AdminSaleWindowsModule } from './admin-sale-windows/admin-sale-windows.module';
import { type Env, validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { ProductImagesModule } from './product-images/product-images.module';
import { ProductsModule } from './products/products.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { SaleWindowsModule } from './sale-windows/sale-windows.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        dbName: config.get('MONGODB_DB_NAME', { infer: true }),
        // Indeksai kuriami automatiškai tik vystant; produkcijoje juos kuriam sąmoningai.
        autoIndex: config.get('NODE_ENV', { infer: true }) !== 'production',
      }),
    }),
    RateLimitModule,
    HealthModule,
    ProductsModule,
    SaleWindowsModule,
    OrdersModule,
    AdminAuthModule,
    AdminProductsModule,
    AdminSaleWindowsModule,
    AdminOrdersModule,
    ProductImagesModule,
  ],
})
export class AppModule {}

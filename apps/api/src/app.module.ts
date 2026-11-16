import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { type Env, validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { ProductsModule } from './products/products.module';
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
        // Indeksai kuriami automatiškai tik vystant; produkcijoje juos kuriam sąmoningai.
        autoIndex: config.get('NODE_ENV', { infer: true }) !== 'production',
      }),
    }),
    HealthModule,
    ProductsModule,
    SaleWindowsModule,
  ],
})
export class AppModule {}

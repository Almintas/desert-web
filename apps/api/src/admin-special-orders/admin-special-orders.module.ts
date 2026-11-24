import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { SpecialOrdersModule } from '../special-orders/special-orders.module';
import { AdminSpecialOrdersController } from './admin-special-orders.controller';
import { AdminSpecialOrdersService } from './admin-special-orders.service';

@Module({
  imports: [
    SpecialOrdersModule, // SpecialOrder modelis
    AdminAuthModule,
  ],
  controllers: [AdminSpecialOrdersController],
  providers: [AdminSpecialOrdersService],
})
export class AdminSpecialOrdersModule {}

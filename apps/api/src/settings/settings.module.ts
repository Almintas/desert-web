import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminSettingsController } from './admin-settings.controller';
import { Settings, SettingsSchema } from './settings.schema';
import { ShopInfoController } from './shop-info.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Settings.name, schema: SettingsSchema }]),
    AdminAuthModule,
  ],
  controllers: [AdminSettingsController, ShopInfoController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

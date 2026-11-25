import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../config/env';
import { SaleWindowsModule } from '../sale-windows/sale-windows.module';
import { SettingsModule } from '../settings/settings.module';
import { EMAIL_SENDER, type EmailSender } from './email-sender';
import { OrderNotificationsService } from './order-notifications.service';
import { ResendEmailSender } from './resend-email-sender';

@Module({
  imports: [
    SaleWindowsModule, // SaleWindow modelis (atsiėmimo vieta ir laikas)
    SettingsModule, // pardavėjo duomenys laiškams
  ],
  providers: [
    OrderNotificationsService,
    {
      // Be RESEND_API_KEY siuntėjo nėra (null): laiškai nesiunčiami. Testai pakeičia
      // šį providerį InMemoryEmailSender.
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailSender | null => {
        const apiKey = config.get('RESEND_API_KEY', { infer: true });
        return apiKey ? new ResendEmailSender(new Resend(apiKey)) : null;
      },
    },
  ],
  exports: [OrderNotificationsService],
})
export class NotificationsModule {}

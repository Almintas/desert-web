import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env';
import { Admin, AdminSchema } from './admin.schema';
import { AdminSession, AdminSessionSchema } from './admin-session.schema';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { RolesGuard } from './roles';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: AdminSession.name, schema: AdminSessionSchema },
    ]),
    // Throttler taikomas tik ten, kur yra @UseGuards(ThrottlerGuard) (šiuo metu login).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            limit: config.get('ADMIN_LOGIN_RATE_LIMIT', { infer: true }),
            ttl: config.get('ADMIN_LOGIN_RATE_WINDOW_SECONDS', { infer: true }) * 1000,
          },
        ],
        errorMessage: 'Per daug bandymų prisijungti. Pabandyk vėliau.',
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAccountsService, AdminAuthGuard, RolesGuard],
  exports: [AdminAuthService, AdminAccountsService, AdminAuthGuard, RolesGuard],
})
export class AdminAuthModule {}

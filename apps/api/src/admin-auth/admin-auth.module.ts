import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from './admin.schema';
import { AdminSession, AdminSessionSchema } from './admin-session.schema';
import { AdminAccountsController } from './admin-accounts.controller';
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
  ],
  controllers: [AdminAuthController, AdminAccountsController],
  providers: [AdminAuthService, AdminAccountsService, AdminAuthGuard, RolesGuard],
  exports: [AdminAuthService, AdminAccountsService, AdminAuthGuard, RolesGuard],
})
export class AdminAuthModule {}

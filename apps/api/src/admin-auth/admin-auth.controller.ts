import {
  type AdminDto,
  type AdminLoginInput,
  type AdminLoginResponse,
  adminLoginInputSchema,
} from '@desert-web/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { AdminRequest } from './admin-request';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { CurrentAdmin } from './current-admin.decorator';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  /** Ribojamas pagal IP (ADMIN_LOGIN_RATE_LIMIT per ADMIN_LOGIN_RATE_WINDOW_SECONDS). */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  login(
    @Body(new ZodValidationPipe(adminLoginInputSchema)) body: AdminLoginInput,
  ): Promise<AdminLoginResponse> {
    return this.auth.login(body);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminAuthGuard)
  async logout(@Req() request: AdminRequest): Promise<void> {
    await this.auth.logout(request.adminSessionId!);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@CurrentAdmin() admin: AdminDto): AdminDto {
    return admin;
  }
}

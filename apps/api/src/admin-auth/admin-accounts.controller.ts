import {
  type AdminCreateInput,
  adminCreateInputSchema,
  type AdminDto,
  type AdminErrorCode,
} from '@desert-web/shared';
import { Body, ConflictException, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminAccountsService, AdminExistsError } from './admin-accounts.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { Roles, RolesGuard } from './roles';

/** Adminų paskyros. Tik owner rolei: staff negali nei matyti, nei kurti adminų. */
@Controller('admin/admins')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles('owner')
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Get()
  findAll(): Promise<AdminDto[]> {
    return this.accounts.list();
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(adminCreateInputSchema)) body: AdminCreateInput,
  ): Promise<AdminDto> {
    try {
      return await this.accounts.create(body.email, body.role, body.password);
    } catch (error) {
      if (error instanceof AdminExistsError) {
        const code: AdminErrorCode = 'ADMIN_EMAIL_TAKEN';
        throw new ConflictException({ code, message: 'Adminas su tokiu el. paštu jau yra' });
      }
      throw error;
    }
  }
}

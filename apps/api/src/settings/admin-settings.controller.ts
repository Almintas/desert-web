import {
  type AdminSettingsInput,
  adminSettingsInputSchema,
  type SettingsDto,
} from '@desert-web/shared';
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { Roles, RolesGuard } from '../admin-auth/roles';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettingsService } from './settings.service';

/** Parduotuvės nustatymai: skaityti gali owner ir staff, keisti tik owner. */
@Controller('admin/settings')
@UseGuards(AdminAuthGuard, RolesGuard)
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<SettingsDto> {
    return this.settings.getOrCreate();
  }

  @Put()
  @Roles('owner')
  update(
    @Body(new ZodValidationPipe(adminSettingsInputSchema)) body: AdminSettingsInput,
  ): Promise<SettingsDto> {
    return this.settings.update(body);
  }
}

import {
  type AdminSaleWindowDto,
  type AdminSaleWindowInput,
  adminSaleWindowInputSchema,
} from '@desert-web/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminSaleWindowsService } from './admin-sale-windows.service';

/** Pardavimo langų valdymas. Leidžiama ir owner, ir staff rolėms. */
@Controller('admin/sale-windows')
@UseGuards(AdminAuthGuard)
export class AdminSaleWindowsController {
  constructor(private readonly windows: AdminSaleWindowsService) {}

  @Get()
  findAll(): Promise<AdminSaleWindowDto[]> {
    return this.windows.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminSaleWindowDto> {
    return this.windows.findById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(adminSaleWindowInputSchema)) body: AdminSaleWindowInput,
  ): Promise<AdminSaleWindowDto> {
    return this.windows.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminSaleWindowInputSchema)) body: AdminSaleWindowInput,
  ): Promise<AdminSaleWindowDto> {
    return this.windows.update(id, body);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id') id: string): Promise<AdminSaleWindowDto> {
    return this.windows.publish(id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id') id: string): Promise<AdminSaleWindowDto> {
    return this.windows.unpublish(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string): Promise<AdminSaleWindowDto> {
    return this.windows.cancel(id);
  }

  @Post(':id/open-now')
  @HttpCode(HttpStatus.OK)
  openNow(@Param('id') id: string): Promise<AdminSaleWindowDto> {
    return this.windows.openNow(id);
  }

  @Post(':id/close-now')
  @HttpCode(HttpStatus.OK)
  closeNow(@Param('id') id: string): Promise<AdminSaleWindowDto> {
    return this.windows.closeNow(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.windows.remove(id);
  }
}

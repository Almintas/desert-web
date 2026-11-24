import {
  type AdminDto,
  type AdminSpecialOrderDto,
  type AdminSpecialOrderListQuery,
  adminSpecialOrderListQuerySchema,
  type AdminSpecialOrderListResponse,
  type AdminSpecialOrderStatsDto,
  type CancelSpecialOrderInput,
  cancelSpecialOrderInputSchema,
  type ConfirmSpecialOrderInput,
  confirmSpecialOrderInputSchema,
  type RejectSpecialOrderInput,
  rejectSpecialOrderInputSchema,
} from '@desert-web/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminSpecialOrdersService } from './admin-special-orders.service';

/** Specialių užsakymų valdymas. Leidžiama ir owner, ir staff rolėms (kaip užsakymai). */
@Controller('admin/special-orders')
@UseGuards(AdminAuthGuard)
export class AdminSpecialOrdersController {
  constructor(private readonly specialOrders: AdminSpecialOrdersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminSpecialOrderListQuerySchema))
    query: AdminSpecialOrderListQuery,
  ): Promise<AdminSpecialOrderListResponse> {
    return this.specialOrders.list(query);
  }

  /** Prieš `:id`, kad „stats“ nebūtų laikomas ID. */
  @Get('stats')
  stats(): Promise<AdminSpecialOrderStatsDto> {
    return this.specialOrders.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminSpecialOrderDto> {
    return this.specialOrders.findById(id);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(confirmSpecialOrderInputSchema)) body: ConfirmSpecialOrderInput,
    @CurrentAdmin() admin: AdminDto,
  ): Promise<AdminSpecialOrderDto> {
    return this.specialOrders.changeStatus(id, { to: 'confirmed', confirmation: body }, admin);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectSpecialOrderInputSchema)) body: RejectSpecialOrderInput,
    @CurrentAdmin() admin: AdminDto,
  ): Promise<AdminSpecialOrderDto> {
    return this.specialOrders.changeStatus(id, { to: 'rejected', reason: body.reason }, admin);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelSpecialOrderInputSchema)) body: CancelSpecialOrderInput,
    @CurrentAdmin() admin: AdminDto,
  ): Promise<AdminSpecialOrderDto> {
    return this.specialOrders.changeStatus(id, { to: 'cancelled', reason: body.reason }, admin);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminDto,
  ): Promise<AdminSpecialOrderDto> {
    return this.specialOrders.changeStatus(id, { to: 'completed' }, admin);
  }
}

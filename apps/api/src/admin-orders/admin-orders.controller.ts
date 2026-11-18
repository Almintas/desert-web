import {
  type AdminCancelOrderInput,
  adminCancelOrderInputSchema,
  type AdminDto,
  type AdminOrderDto,
  type AdminOrderListQuery,
  adminOrderListQuerySchema,
  type AdminOrderListResponse,
  type AdminOrderStatusInput,
  adminOrderStatusInputSchema,
  type OrderErrorCode,
} from '@desert-web/shared';
import {
  Body,
  ConflictException,
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
import { AdminOrdersService } from './admin-orders.service';

/** Užsakymų valdymas. Leidžiama ir owner, ir staff rolėms. */
@Controller('admin/orders')
@UseGuards(AdminAuthGuard)
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminOrderListQuerySchema)) query: AdminOrderListQuery,
  ): Promise<AdminOrderListResponse> {
    return this.orders.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminOrderDto> {
    return this.orders.findById(id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminOrderStatusInputSchema)) body: AdminOrderStatusInput,
    @CurrentAdmin() admin: AdminDto,
  ): Promise<AdminOrderDto> {
    if (body.status === 'cancelled') {
      // Atšaukimas grąžina kiekius ir saugo priežastį, todėl tik per /cancel.
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION' satisfies OrderErrorCode,
        message: 'Užsakymą atšaukti galima tik veiksmu „Atšaukti užsakymą“',
      });
    }
    return this.orders.changeStatus(id, body.status, admin);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminCancelOrderInputSchema)) body: AdminCancelOrderInput,
    @CurrentAdmin() admin: AdminDto,
  ): Promise<AdminOrderDto> {
    return this.orders.changeStatus(id, 'cancelled', admin, { reason: body.reason });
  }
}

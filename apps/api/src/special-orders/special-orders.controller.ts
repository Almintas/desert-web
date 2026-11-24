import {
  type CreateSpecialOrderInput,
  type CreateSpecialOrderResponse,
  createSpecialOrderInputSchema,
  type SpecialOrderConfigDto,
  type SpecialOrderDto,
} from '@desert-web/shared';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ClientIpRequest } from '../common/client-ip';
import { InternalClientGuard } from '../common/internal-client.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { SpecialOrdersService } from './special-orders.service';

/** Vieši (pirkėjų) specialių užsakymų endpointai. Admin valdymas: admin-special-orders. */
@Controller('special-orders')
export class SpecialOrdersController {
  constructor(private readonly specialOrders: SpecialOrdersService) {}

  /**
   * Formos duomenys (vieši, kaip /products ir /sale-windows/current): ar įjungta, datų ribos
   * ir tinkami produktai su bazinėmis kainomis.
   */
  @Get('config')
  config(): Promise<SpecialOrderConfigDto> {
    return this.specialOrders.config();
  }

  /**
   * Nauja užklausa. Apsauga kaip POST /orders: ribojimas pagal IP (atskiri skaitikliai, tos
   * pačios ribos) → produkcijoje tik su INTERNAL_API_SECRET → validacija → idempotencija →
   * Turnstile. 201 naujai užklausai, 200 pakartojimui su tuo pačiu clientRequestId.
   */
  @Post()
  @UseGuards(InternalClientGuard)
  @RateLimit('order-create-short', 'order-create-daily')
  async create(
    @Body(new ZodValidationPipe(createSpecialOrderInputSchema)) body: CreateSpecialOrderInput,
    @Req() req: ClientIpRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateSpecialOrderResponse> {
    const { response, created } = await this.specialOrders.create(body, {
      clientIp: req.clientIp,
    });
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return response;
  }

  /** Pirkėjo užklausos peržiūra pagal slaptą nuorodą (ribojimas kaip /orders/access). */
  @Get('access/:accessToken')
  @RateLimit('order-access')
  findByAccessToken(@Param('accessToken') accessToken: string): Promise<SpecialOrderDto> {
    return this.specialOrders.findByAccessToken(accessToken);
  }
}

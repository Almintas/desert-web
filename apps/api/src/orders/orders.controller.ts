import {
  type CreateOrderInput,
  type CreateOrderResponse,
  createOrderInputSchema,
  type OrderAccessDto,
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
import { OrdersService } from './orders.service';

/** Vieši (pirkėjų) endpointai. Admin valdymas yra admin-orders modulyje. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Užsakymas atidarytame pardavimo lange. Atsakymas: CreateOrderResponse, 201 naujam
   * užsakymui ir 200, jei užsakymas su tuo pačiu clientRequestId jau sukurtas.
   *
   * Kviečiamas iš web Next.js serverio (Server Action). Tikras pirkėjo IP yra
   * `req.clientIp` (žr. client-ip.ts), kai užklausa turi teisingą INTERNAL_API_SECRET.
   *
   * Eilė: ribojimas pagal IP (skaičiuojamas kiekvienas bandymas) → produkcijoje tik su
   * INTERNAL_API_SECRET (403 FORBIDDEN_CLIENT) → body validacija → idempotencija →
   * Turnstile → transakcija su kiekių rezervacija.
   */
  @Post()
  // Guard'ai vykdomi ta tvarka, kuria pridedami (dekoratoriai taikomi iš apačios), todėl
  // InternalClientGuard yra virš RateLimit: pirmiau ribojimas, tada paslapties patikra.
  @UseGuards(InternalClientGuard)
  @RateLimit('order-create-short', 'order-create-daily')
  async create(
    @Body(new ZodValidationPipe(createOrderInputSchema)) body: CreateOrderInput,
    @Req() req: ClientIpRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateOrderResponse> {
    const { response, created } = await this.ordersService.create(body, {
      clientIp: req.clientIp,
    });
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return response;
  }

  /** Pirkėjo užsakymo peržiūra pagal slaptą nuorodą iš patvirtinimo puslapio. */
  @Get('access/:accessToken')
  @RateLimit('order-access')
  findByAccessToken(@Param('accessToken') accessToken: string): Promise<OrderAccessDto> {
    return this.ordersService.findByAccessToken(accessToken);
  }
}

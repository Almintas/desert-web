import {
  type CreateOrderInput,
  type CreateOrderResponse,
  createOrderInputSchema,
  type OrderAccessDto,
} from '@desert-web/shared';
import { Body, Controller, Get, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
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
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createOrderInputSchema)) body: CreateOrderInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateOrderResponse> {
    const { response, created } = await this.ordersService.create(body);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return response;
  }

  /** Pirkėjo užsakymo peržiūra pagal slaptą nuorodą iš patvirtinimo puslapio. */
  @Get('access/:accessToken')
  findByAccessToken(@Param('accessToken') accessToken: string): Promise<OrderAccessDto> {
    return this.ordersService.findByAccessToken(accessToken);
  }
}

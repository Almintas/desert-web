import { type CreateOrderInput, createOrderInputSchema } from '@desert-web/shared';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrdersService } from './orders.service';

/** Vieši (pirkėjų) endpointai. Admin valdymas bus atskirame modulyje su autentifikacija. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /** Užsakymas atidarytame pardavimo lange. Atsakymas: CreateOrderResponse (201). */
  @Post()
  create(@Body(new ZodValidationPipe(createOrderInputSchema)) body: CreateOrderInput) {
    return this.ordersService.create(body);
  }

  /** Pirkėjo užsakymo peržiūra pagal slaptą nuorodą iš patvirtinimo laiško / puslapio. */
  @Get('access/:accessToken')
  findByAccessToken(@Param('accessToken') accessToken: string) {
    return this.ordersService.findByAccessToken(accessToken);
  }
}

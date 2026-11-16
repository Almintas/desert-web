import { Controller, Get, Param } from '@nestjs/common';
import { ProductsService } from './products.service';

/** Vieši (pirkėjų) endpointai. Admin CRUD bus atskirame admin modulyje su autentifikacija. */
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll() {
    return this.productsService.findActive();
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }
}

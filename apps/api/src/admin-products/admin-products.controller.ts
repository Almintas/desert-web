import {
  type AdminProductInput,
  adminProductInputSchema,
  type ProductDto,
} from '@desert-web/shared';
import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminProductsService } from './admin-products.service';

/** Produktų valdymas. Leidžiama ir owner, ir staff rolėms. Trynimo nėra: archyvuojama isActive=false. */
@Controller('admin/products')
@UseGuards(AdminAuthGuard)
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}

  @Get()
  findAll(): Promise<ProductDto[]> {
    return this.products.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ProductDto> {
    return this.products.findById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(adminProductInputSchema)) body: AdminProductInput,
  ): Promise<ProductDto> {
    return this.products.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminProductInputSchema)) body: AdminProductInput,
  ): Promise<ProductDto> {
    return this.products.update(id, body);
  }
}

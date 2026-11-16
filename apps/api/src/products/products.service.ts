import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ProductDto } from '@desert-web/shared';
import { Model } from 'mongoose';
import { Product } from './product.schema';
import { toProductDto } from './products.mapper';

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private readonly productModel: Model<Product>) {}

  async findActive(): Promise<ProductDto[]> {
    const products = await this.productModel
      .find({ isActive: true })
      .sort({ name: 1 })
      .lean<Product[]>()
      .exec();
    return products.map(toProductDto);
  }

  async findBySlug(slug: string): Promise<ProductDto> {
    const product = await this.productModel
      .findOne({ slug: slug.toLowerCase(), isActive: true })
      .lean<Product>()
      .exec();
    if (!product) throw new NotFoundException('Produktas nerastas');
    return toProductDto(product);
  }
}

import {
  type AdminProductDto,
  type AttachProductImageInput,
  attachProductImageInputSchema,
  type ProductImageUploadSignatureDto,
  type ReorderProductImagesInput,
  reorderProductImagesInputSchema,
} from '@desert-web/shared';
import { Body, Controller, Delete, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CloudinaryService } from './cloudinary.service';
import { ProductImagesService } from './product-images.service';

/** Pasirašytas tiesioginis įkėlimas į Cloudinary. Abi rolės (owner ir staff). */
@Controller('admin/uploads')
@UseGuards(AdminAuthGuard)
export class AdminUploadsController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @Post('product-image-signature')
  @HttpCode(200)
  productImageSignature(): ProductImageUploadSignatureDto {
    return this.cloudinary.signUpload();
  }
}

/** Produkto nuotraukų valdymas. Abi rolės; archyvuotiems produktams taip pat. */
@Controller('admin/products/:id/images')
@UseGuards(AdminAuthGuard)
export class AdminProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Post()
  attach(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attachProductImageInputSchema)) body: AttachProductImageInput,
  ): Promise<AdminProductDto> {
    return this.images.attach(id, body);
  }

  @Put('order')
  reorder(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reorderProductImagesInputSchema)) body: ReorderProductImagesInput,
  ): Promise<AdminProductDto> {
    return this.images.reorder(id, body.imageIds);
  }

  @Delete(':imageId')
  remove(@Param('id') id: string, @Param('imageId') imageId: string): Promise<AdminProductDto> {
    return this.images.remove(id, imageId);
  }
}

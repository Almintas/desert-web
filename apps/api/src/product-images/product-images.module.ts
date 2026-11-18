import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ProductsModule } from '../products/products.module';
import { CloudinaryService } from './cloudinary.service';
import { AdminProductImagesController, AdminUploadsController } from './product-images.controller';
import { ProductImagesService } from './product-images.service';

/** Produktų nuotraukos (Cloudinary): pasirašytas įkėlimas, pridėjimas, rikiavimas, šalinimas. */
@Module({
  imports: [ProductsModule, AdminAuthModule],
  controllers: [AdminUploadsController, AdminProductImagesController],
  providers: [CloudinaryService, ProductImagesService],
  exports: [CloudinaryService],
})
export class ProductImagesModule {}

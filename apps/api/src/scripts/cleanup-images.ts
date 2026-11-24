/**
 * Ištrina Cloudinary nuotraukas, kurių nenaudoja joks produktas (aktyvus ar archyvuotas):
 * nutrūkę įkėlimai, uždarytos formos. Liečiamas tik produktų katalogas (CLOUDINARY_FOLDER,
 * numatyta desert-web/<NODE_ENV>/products). Naujesni nei --older-than-hours (numatyta 24)
 * failai paliekami: jie gali būti įkeliami dabar.
 *
 * Numatyta: dry run (tik sąrašas). Trinama tik su --apply.
 *
 *   pnpm turbo run build --filter=@desert-web/api
 *   pnpm --filter @desert-web/api images:cleanup
 *   pnpm --filter @desert-web/api images:cleanup --apply
 *   pnpm --filter @desert-web/api images:cleanup --older-than-hours=72 --apply
 */
import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { CloudinaryService } from '../product-images/cloudinary.service';
import {
  CleanupSafetyError,
  folderPrefix,
  mongoImageReferences,
  parseOlderThanHours,
  runImageCleanup,
} from '../product-images/image-cleanup';
import { Product } from '../products/product.schema';

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      'older-than-hours': { type: 'string' },
    },
  });
  const olderThanHours = parseOlderThanHours(values['older-than-hours']);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const cloudinary = app.get(CloudinaryService);
    // Tie patys nustatymai kaip API (env.ts + CloudinaryService); be jų klaida IMAGES_NOT_CONFIGURED.
    const { folder } = cloudinary.require();
    folderPrefix(folder);
    const productModel = app.get<Model<Product>>(getModelToken(Product.name));

    const report = await runImageCleanup(cloudinary, mongoImageReferences(productModel), {
      folder,
      olderThanHours,
      apply: values.apply,
    });
    if (report.failed.length > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  // Laukiamos klaidos (saugumo patikros, blogi argumentai) be stack trace.
  const badArgs =
    error instanceof Error &&
    String((error as { code?: unknown }).code).startsWith('ERR_PARSE_ARGS');
  const expected = error instanceof CleanupSafetyError || badArgs;
  console.error(expected ? `Error: ${(error as Error).message}` : error);
  process.exit(1);
});

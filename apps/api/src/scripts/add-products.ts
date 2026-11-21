/**
 * Prideda EXTRA_PRODUCTS (žr. extra-products.ts) prie esamos DB. Nieko netrina ir
 * nekeičia: produktai, kurių slug jau yra, praleidžiami, todėl saugu paleisti kelis kartus.
 * Galima ir produkcijoje.
 *
 * Paleidimas: pnpm turbo run build --filter=@desert-web/api && pnpm --filter @desert-web/api products:add
 */
import { productInputSchema } from '@desert-web/shared';
import mongoose from 'mongoose';
import { Product, ProductSchema } from '../products/product.schema';
import { EXTRA_PRODUCTS } from './extra-products';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME?.trim() || undefined });
  const ProductModel = mongoose.model(Product.name, ProductSchema);

  const products = EXTRA_PRODUCTS.map((p) => productInputSchema.parse(p));
  const existing = new Set(
    (
      await ProductModel.find({ slug: { $in: products.map((p) => p.slug) } }, { slug: 1 }).lean()
    ).map((p) => p.slug),
  );

  const toCreate = products.filter((p) => !existing.has(p.slug!));
  for (const p of products) {
    console.log(`${existing.has(p.slug!) ? 'skip (exists)' : 'add'}: ${p.slug}`);
  }
  if (toCreate.length > 0) await ProductModel.create(toCreate);

  console.log(`Done: ${toCreate.length} added, ${products.length - toCreate.length} skipped.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});

/**
 * Užpildo DB pavyzdiniais duomenimis vystymui.
 * Paleidimas: pnpm --filter @desert-web/api build && pnpm --filter @desert-web/api seed
 *
 * DĖMESIO: ištrina visus produktus ir pardavimo langus. Nenaudoti produkcinėje DB.
 */
import mongoose from 'mongoose';
import { Product, ProductSchema } from '../products/product.schema';
import { SaleWindow, SaleWindowSchema } from '../sale-windows/sale-window.schema';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing (in .env)');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed is not allowed in production');
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME?.trim() || undefined });
  const ProductModel = mongoose.model(Product.name, ProductSchema);
  const SaleWindowModel = mongoose.model(SaleWindow.name, SaleWindowSchema);

  await Promise.all([ProductModel.deleteMany({}), SaleWindowModel.deleteMany({})]);

  const [macarons, tart] = await ProductModel.create([
    {
      name: 'Makaronų dėžutė',
      slug: 'makaronu-dezute',
      description: 'Fiksuotas skonių rinkinys.',
      category: 'macarons',
      allergens: ['eggs', 'nuts', 'milk'],
      variants: [
        { name: '6 vnt.', priceCents: 1200 },
        { name: '12 vnt.', priceCents: 2200 },
      ],
      specialOrder: { enabled: true, minQuantity: 10 },
    },
    {
      name: 'Citrinų tartaletė',
      slug: 'citrinu-tartalete',
      description: 'Trapi tešla ir citrinų kremas.',
      category: 'tarts',
      allergens: ['gluten', 'eggs', 'milk'],
      variants: [{ name: '1 vnt.', priceCents: 450 }],
      specialOrder: { enabled: true, minQuantity: 20 },
    },
    {
      name: 'Medaus tortas',
      slug: 'medaus-tortas',
      description: 'Ploni medaus biskvito sluoksniai su grietinės kremu.',
      category: 'cakes',
      allergens: ['gluten', 'eggs', 'milk'],
      variants: [
        { name: '1 kg', priceCents: 2800 },
        { name: '2 kg', priceCents: 5200 },
      ],
      specialOrder: { enabled: true, minQuantity: 3 },
    },
    {
      name: 'Šokoladinis brownie',
      slug: 'sokoladinis-brownie',
      description: 'Drėgnas juodojo šokolado pyragas su graikiniais riešutais.',
      category: 'brownies',
      allergens: ['gluten', 'eggs', 'milk', 'nuts'],
      variants: [
        { name: '1 vnt.', priceCents: 350 },
        { name: '4 vnt.', priceCents: 1300 },
      ],
      specialOrder: { enabled: true, minQuantity: 24 },
    },
    {
      name: 'Braškių sūrio pyragas',
      slug: 'braskiu-surio-pyragas',
      description: 'Kreminis sūrio pyragas ant sausainių pagrindo su braškių padažu.',
      category: 'cheesecakes',
      allergens: ['gluten', 'eggs', 'milk'],
      variants: [
        { name: '1 gabalėlis', priceCents: 550 },
        { name: 'Visas (8 gab.)', priceCents: 3600 },
      ],
      specialOrder: { enabled: false, minQuantity: 1 },
    },
    {
      name: 'Tiramisu indelis',
      slug: 'tiramisu-indelis',
      description: 'Savoiardi sausainiai, espresso ir maskarponės kremas.',
      category: 'jar-desserts',
      allergens: ['gluten', 'eggs', 'milk'],
      variants: [{ name: '200 ml', priceCents: 600 }],
      specialOrder: { enabled: true, minQuantity: 15 },
    },
    {
      name: 'Cinamono bandelės',
      slug: 'cinamono-bandeles',
      description: 'Minkštos mielinės bandelės su cinamonu ir sūrio kremo glajumi.',
      category: 'pastries',
      allergens: ['gluten', 'eggs', 'milk'],
      variants: [
        { name: '4 vnt.', priceCents: 1000 },
        { name: '9 vnt.', priceCents: 2000 },
      ],
      specialOrder: { enabled: true, minQuantity: 5 },
    },
  ]);

  if (!macarons || !tart) throw new Error('Failed to create products');
  const m6 = macarons.variants[0]!;
  const m12 = macarons.variants[1]!;
  const t1 = tart.variants[0]!;

  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  await SaleWindowModel.create([
    {
      title: 'Savaitgalio pardavimas',
      status: 'published',
      opensAt: new Date(now - hour),
      closesAt: new Date(now + 2 * day),
      fulfillment: {
        pickupAvailable: true,
        pickupLocation: 'Vilnius, Gedimino pr. 1',
        pickupFrom: new Date(now + 3 * day),
        pickupTo: new Date(now + 3 * day + 6 * hour),
        deliveryAvailable: false,
      },
      items: [
        {
          productId: macarons._id,
          variantId: m6._id,
          priceCents: 1200,
          quantityTotal: 30,
          quantityAvailable: 30,
          maxPerCustomer: 4,
        },
        {
          productId: macarons._id,
          variantId: m12._id,
          priceCents: 2200,
          quantityTotal: 15,
          quantityAvailable: 15,
          maxPerCustomer: 2,
        },
        {
          productId: tart._id,
          variantId: t1._id,
          priceCents: 450,
          quantityTotal: 40,
          quantityAvailable: 40,
          maxPerOrder: 6,
        },
      ],
    },
    {
      title: 'Kalėdinis pardavimas',
      status: 'published',
      opensAt: new Date(now + 10 * day),
      closesAt: new Date(now + 13 * day),
      fulfillment: {
        pickupAvailable: true,
        pickupLocation: 'Vilnius, Gedimino pr. 1',
        pickupFrom: new Date(now + 14 * day),
        pickupTo: new Date(now + 14 * day + 6 * hour),
        deliveryAvailable: false,
      },
      items: [
        {
          productId: macarons._id,
          variantId: m12._id,
          priceCents: 2400,
          quantityTotal: 50,
          quantityAvailable: 50,
          maxPerCustomer: 3,
        },
      ],
    },
  ]);

  console.log('Seed done: 7 products, 2 sale windows (one open, one upcoming).');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});

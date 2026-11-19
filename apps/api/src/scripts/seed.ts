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
  if (!uri) throw new Error('Trūksta MONGODB_URI (.env faile)');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed neleidžiamas produkcijoje');
  }

  await mongoose.connect(uri);
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
  ]);

  if (!macarons || !tart) throw new Error('Nepavyko sukurti produktų');
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

  console.log('Seed baigtas: 2 produktai, 2 pardavimo langai (vienas atidarytas, vienas būsimas).');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});

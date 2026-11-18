import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Counter } from '../src/counters/counter.schema';
import { Order } from '../src/orders/order.schema';
import { Product } from '../src/products/product.schema';
import { SaleWindow } from '../src/sale-windows/sale-window.schema';

const MINUTE = 60_000;

export interface TestContext {
  app: NestExpressApplication;
  connection: Connection;
  productModel: Model<Product>;
  saleWindowModel: Model<SaleWindow>;
  orderModel: Model<Order>;
  counterModel: Model<Counter>;
}

/**
 * Paleidžia tikrą AppModule (MONGODB_URI nustato global-setup.ts) su tais pačiais
 * nustatymais kaip main.ts. `extra` leidžia pridėti tik testams skirtus controllerius.
 */
export async function createTestContext(
  extra: Pick<ModuleMetadata, 'imports' | 'controllers'> = {},
): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(extra.imports ?? [])],
    controllers: extra.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  // Kolekcijos ir indeksai (ypač unikalūs) turi egzistuoti prieš pirmą transakciją,
  // kaip ir produkcijoje, kur indeksai kuriami sąmoningai prieš paleidimą.
  await Promise.all(Object.values(connection.models).map((m) => m.init()));

  return {
    app,
    connection,
    productModel: app.get(getModelToken(Product.name)),
    saleWindowModel: app.get(getModelToken(SaleWindow.name)),
    orderModel: app.get(getModelToken(Order.name)),
    counterModel: app.get(getModelToken(Counter.name)),
  };
}

/** Išvalo dokumentus, bet palieka kolekcijas ir indeksus. */
export async function clearDatabase(connection: Connection): Promise<void> {
  const collections = await connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export interface ProductFixture {
  productId: Types.ObjectId;
  /** Variantų ID ta pačia tvarka kaip `variants`. */
  variantIds: Types.ObjectId[];
}

export async function createProduct(
  ctx: TestContext,
  overrides: {
    name?: string;
    variants?: { name: string; priceCents: number }[];
  } = {},
): Promise<ProductFixture> {
  const slugSuffix = new Types.ObjectId().toString();
  const product = await ctx.productModel.create({
    name: overrides.name ?? 'Medaus tortas',
    slug: `produktas-${slugSuffix}`,
    category: 'tortai',
    variants: overrides.variants ?? [{ name: '1 kg', priceCents: 2500 }],
  });
  return { productId: product._id, variantIds: product.variants.map((v) => v._id) };
}

export interface WindowItemFixture {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  priceCents?: number;
  quantity?: number;
  maxPerOrder?: number;
  maxPerCustomer?: number;
}

/**
 * Sukuria pardavimo langą. Laikai nurodomi minutėmis nuo Date.now():
 * pagal nutylėjimą langas atidarytas prieš 60 min. ir užsidaro po 60 min.
 */
export async function createSaleWindow(
  ctx: TestContext,
  options: {
    items: WindowItemFixture[];
    status?: 'draft' | 'published' | 'cancelled';
    opensInMinutes?: number;
    closesInMinutes?: number;
    pickupAvailable?: boolean;
    deliveryAvailable?: boolean;
  },
): Promise<SaleWindow> {
  const now = Date.now();
  const doc = await ctx.saleWindowModel.create({
    title: 'Savaitgalio pardavimas',
    status: options.status ?? 'published',
    opensAt: new Date(now + (options.opensInMinutes ?? -60) * MINUTE),
    closesAt: new Date(now + (options.closesInMinutes ?? 60) * MINUTE),
    fulfillment: {
      pickupAvailable: options.pickupAvailable ?? true,
      deliveryAvailable: options.deliveryAvailable ?? true,
    },
    items: options.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      priceCents: i.priceCents ?? 2000,
      quantityTotal: i.quantity ?? 10,
      quantityAvailable: i.quantity ?? 10,
      maxPerOrder: i.maxPerOrder,
      maxPerCustomer: i.maxPerCustomer,
    })),
  });
  return doc.toObject();
}

export async function getQuantityAvailable(
  ctx: TestContext,
  saleWindowId: Types.ObjectId,
  variantId: Types.ObjectId,
): Promise<number> {
  const w = await ctx.saleWindowModel.findById(saleWindowId).lean<SaleWindow>().exec();
  const item = w?.items.find((i) => i.variantId.equals(variantId));
  if (!item) throw new Error('Prekė lange nerasta');
  return item.quantityAvailable;
}

let customerSeq = 0;

/** Unikalus pirkėjas (skirtingas el. paštas ir telefonas). */
export function uniqueCustomer(): { name: string; email: string; phone: string } {
  customerSeq += 1;
  const n = String(customerSeq).padStart(5, '0');
  return { name: `Pirkėjas ${n}`, email: `pirkejas${n}@example.com`, phone: `+370600${n}` };
}

export function orderBody(
  saleWindowId: Types.ObjectId | string,
  items: { variantId: Types.ObjectId | string; quantity: number }[],
  overrides: {
    customer?: { name: string; email: string; phone: string };
    fulfillment?: { method: 'pickup' | 'delivery'; address?: string; notes?: string };
  } = {},
) {
  return {
    saleWindowId: saleWindowId.toString(),
    customer: overrides.customer ?? uniqueCustomer(),
    items: items.map((i) => ({ variantId: i.variantId.toString(), quantity: i.quantity })),
    fulfillment: overrides.fulfillment ?? { method: 'pickup' },
  };
}

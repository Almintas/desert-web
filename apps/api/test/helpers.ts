import { randomUUID } from 'node:crypto';
import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import {
  type AdminSaleWindowDto,
  type AdminSaleWindowInputBody,
  TURNSTILE_TEST_KEYS,
} from '@desert-web/shared';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import request from 'supertest';
import { AdminAccountsService } from '../src/admin-auth/admin-accounts.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Counter } from '../src/counters/counter.schema';
import { EMAIL_SENDER } from '../src/notifications/email-sender';
import { InMemoryEmailSender } from '../src/notifications/in-memory-email-sender';
import { OrderNotificationsService } from '../src/notifications/order-notifications.service';
import { Order } from '../src/orders/order.schema';
import { Product } from '../src/products/product.schema';
import { SaleWindow } from '../src/sale-windows/sale-window.schema';
import {
  SITEVERIFY_CLIENT,
  type SiteverifyClient,
  type SiteverifyRequest,
} from '../src/turnstile/siteverify';

const MINUTE = 60_000;
const HOUR = 3_600_000;

export interface TestContext {
  app: NestExpressApplication;
  connection: Connection;
  productModel: Model<Product>;
  saleWindowModel: Model<SaleWindow>;
  orderModel: Model<Order>;
  counterModel: Model<Counter>;
  /** Laiškai niekada nesiunčiami į Resend: visi lieka čia (siunčiami tik su RESEND_API_KEY). */
  emails: InMemoryEmailSender;
  notifications: OrderNotificationsService;
}

/**
 * Cloudflare siteverify pakaitalas testams (jokių tinklo užklausų). Elgiasi kaip Cloudflare
 * testiniai secret key (https://developers.cloudflare.com/turnstile/troubleshooting/testing/):
 * "1x…" priima tik XXXX.DUMMY.TOKEN.XXXX, "2x…" visada atmeta, "3x…" grąžina timeout-or-duplicate.
 */
export const fakeSiteverify: SiteverifyClient = async ({ secret, response }: SiteverifyRequest) => {
  if (secret.startsWith('1x') && response === TURNSTILE_TEST_KEYS.dummyToken) {
    return { success: true, hostname: 'example.com', 'error-codes': [] };
  }
  if (secret.startsWith('3x')) return { success: false, 'error-codes': ['timeout-or-duplicate'] };
  return { success: false, 'error-codes': ['invalid-input-response'] };
};

/**
 * Paleidžia tikrą AppModule (MONGODB_URI nustato global-setup.ts) su tais pačiais
 * nustatymais kaip main.ts. `extra` leidžia pridėti tik testams skirtus controllerius,
 * `siteverify` pakeičia Cloudflare klientą (numatyta: fakeSiteverify).
 */
export async function createTestContext(
  extra: Pick<ModuleMetadata, 'imports' | 'controllers'> & { siteverify?: SiteverifyClient } = {},
): Promise<TestContext> {
  const emails = new InMemoryEmailSender();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(extra.imports ?? [])],
    controllers: extra.controllers ?? [],
  })
    .overrideProvider(SITEVERIFY_CLIENT)
    .useValue(extra.siteverify ?? fakeSiteverify)
    .overrideProvider(EMAIL_SENDER)
    .useValue(emails)
    .compile();
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
    emails,
    notifications: app.get(OrderNotificationsService),
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
    description?: string;
    allergens?: string[];
  } = {},
): Promise<ProductFixture> {
  const slugSuffix = new Types.ObjectId().toString();
  const product = await ctx.productModel.create({
    name: overrides.name ?? 'Medaus tortas',
    slug: `produktas-${slugSuffix}`,
    category: 'tortai',
    variants: overrides.variants ?? [{ name: '1 kg', priceCents: 2500 }],
    ...(overrides.description !== undefined ? { description: overrides.description } : {}),
    ...(overrides.allergens !== undefined ? { allergens: overrides.allergens } : {}),
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
    pickupLocation?: string;
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
      pickupLocation: options.pickupLocation,
      pickupFrom: options.pickupLocation ? new Date(now + 2 * HOUR) : undefined,
      pickupTo: options.pickupLocation ? new Date(now + 4 * HOUR) : undefined,
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
    /** Numatyta: naujas UUID (kiekvienas kvietimas yra atskiras pirkėjo bandymas). */
    clientRequestId?: string;
    /** Numatyta: Cloudflare testinis tokenas; null: be tokeno. */
    turnstileToken?: string | null;
  } = {},
) {
  const token =
    overrides.turnstileToken === undefined
      ? TURNSTILE_TEST_KEYS.dummyToken
      : (overrides.turnstileToken ?? undefined);
  return {
    clientRequestId: overrides.clientRequestId ?? randomUUID(),
    ...(token === undefined ? {} : { turnstileToken: token }),
    saleWindowId: saleWindowId.toString(),
    customer: overrides.customer ?? uniqueCustomer(),
    items: items.map((i) => ({ variantId: i.variantId.toString(), quantity: i.quantity })),
    fulfillment: overrides.fulfillment ?? { method: 'pickup' },
  };
}

let adminSeq = 0;

/** Sukuria adminą ir prisijungia (kiekvienas kartas iš kito IP, kad netrukdytų ribojimas). */
export async function loginAdmin(
  ctx: TestContext,
  role: 'owner' | 'staff' = 'owner',
): Promise<string> {
  adminSeq += 1;
  const email = `admin${adminSeq}@example.com`;
  const password = 'teisingas-slaptazodis';
  await ctx.app.get(AdminAccountsService).create(email, role, password);
  const res = await request(ctx.app.getHttpServer())
    .post('/admin/auth/login')
    .set('X-Forwarded-For', `10.9.${Math.floor(adminSeq / 250)}.${adminSeq % 250}`)
    .send({ email, password });
  if (res.status !== 200) throw new Error(`Prisijungti nepavyko: ${res.status}`);
  return res.body.token as string;
}

// --- Admin pardavimo langų užklausų body ---

export const iso = (hoursFromNow: number) =>
  new Date(Date.now() + hoursFromNow * HOUR).toISOString();

export type ItemBody = AdminSaleWindowInputBody['items'][number];

export function item(p: ProductFixture, variant = 0, overrides: Partial<ItemBody> = {}): ItemBody {
  return {
    productId: p.productId.toString(),
    variantId: p.variantIds[variant]!.toString(),
    priceCents: 2000,
    quantityTotal: 10,
    ...overrides,
  };
}

export function windowBody(
  items: ItemBody[],
  overrides: Partial<AdminSaleWindowInputBody> = {},
): AdminSaleWindowInputBody {
  return {
    title: 'Kalėdinis pardavimas',
    opensAt: iso(24),
    closesAt: iso(48),
    fulfillment: {
      pickupAvailable: true,
      pickupLocation: 'Vilnius',
      pickupFrom: iso(50),
      pickupTo: iso(52),
      deliveryAvailable: false,
    },
    items,
    ...overrides,
  };
}

/** PUT body iš DTO (esamos prekės pagal variantId). */
export function bodyFrom(
  w: AdminSaleWindowDto,
  overrides: Partial<AdminSaleWindowInputBody> = {},
): AdminSaleWindowInputBody {
  return {
    title: w.title,
    opensAt: w.opensAt,
    closesAt: w.closesAt,
    fulfillment: {
      pickupAvailable: w.fulfillment.pickupAvailable,
      pickupLocation: w.fulfillment.pickupLocation ?? undefined,
      pickupFrom: w.fulfillment.pickupFrom ?? undefined,
      pickupTo: w.fulfillment.pickupTo ?? undefined,
      deliveryAvailable: w.fulfillment.deliveryAvailable,
    },
    items: w.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      priceCents: i.priceCents,
      quantityTotal: i.quantityTotal,
      maxPerOrder: i.maxPerOrder ?? undefined,
      maxPerCustomer: i.maxPerCustomer ?? undefined,
    })),
    ...overrides,
  };
}

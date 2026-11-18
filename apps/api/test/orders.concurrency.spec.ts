import { getShopYear } from '@desert-web/shared';
import type { mongo } from 'mongoose';
import request from 'supertest';
import { CountersService } from '../src/counters/counters.service';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  getQuantityAvailable,
  orderBody,
  type TestContext,
} from './helpers';

describe('Užsakymai: lygiagretumas', () => {
  let ctx: TestContext;

  const post = (body: object) => request(ctx.app.getHttpServer()).post('/orders').send(body);

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
  });

  it('20 lygiagrečių užsakymų, kai likutis 5: lygiai 5 sėkmingi, 15 INSUFFICIENT_STOCK', async () => {
    const p = await createProduct(ctx);
    const variantId = p.variantIds[0]!;
    const window = await createSaleWindow(ctx, {
      items: [{ productId: p.productId, variantId, quantity: 5 }],
    });

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => post(orderBody(window._id, [{ variantId, quantity: 1 }]))),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s >= 500)).toEqual([]);
    const ok = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status === 409);
    expect(ok).toHaveLength(5);
    expect(rejected).toHaveLength(15);
    for (const r of rejected) expect(r.body.code).toBe('INSUFFICIENT_STOCK');

    expect(await getQuantityAvailable(ctx, window._id, variantId)).toBe(0);
    expect(await ctx.orderModel.countDocuments()).toBe(5);

    const year = getShopYear(new Date());
    const numbers = ok.map((r) => r.body.order.orderNumber as string).sort();
    expect(numbers).toEqual([1, 2, 3, 4, 5].map((n) => `DW-${year}-000${n}`));
  });

  it('tas pats pirkėjas, maxPerCustomer 2, 5 lygiagretūs užsakymai: iš viso ne daugiau 2', async () => {
    const p = await createProduct(ctx);
    const variantId = p.variantIds[0]!;
    const window = await createSaleWindow(ctx, {
      items: [{ productId: p.productId, variantId, quantity: 50, maxPerCustomer: 2 }],
    });
    const customer = { name: 'Petras', email: 'petras@example.com', phone: '+37065555555' };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(orderBody(window._id, [{ variantId, quantity: 1 }], { customer })),
      ),
    );

    expect(responses.filter((r) => r.status >= 500)).toEqual([]);
    const ok = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status === 409);
    expect(ok).toHaveLength(2);
    expect(rejected).toHaveLength(3);
    for (const r of rejected) expect(r.body.code).toBe('MAX_PER_CUSTOMER_EXCEEDED');

    const orders = await ctx.orderModel.find().lean().exec();
    const total = orders.flatMap((o) => o.items).reduce((sum, i) => sum + i.quantity, 0);
    expect(total).toBe(2);
    expect(await getQuantityAvailable(ctx, window._id, variantId)).toBe(48);
  });

  it('pirmi metų užsakymai skirtinguose languose vienu metu: skaitiklio upsert negrąžina 500', async () => {
    // Lenktynės nedeterministinės, todėl kartojam kelis raundus, kiekvieną nuo tuščios
    // counters kolekcijos ir su keliais langais, kad upsert'ai tikrai susikirstų.
    const rounds = 10;
    const windowsPerRound = 5;
    const year = getShopYear(new Date());

    for (let round = 0; round < rounds; round++) {
      await clearDatabase(ctx.connection);
      const p = await createProduct(ctx);
      const variantId = p.variantIds[0]!;
      const windows = await Promise.all(
        Array.from({ length: windowsPerRound }, () =>
          createSaleWindow(ctx, { items: [{ productId: p.productId, variantId, quantity: 5 }] }),
        ),
      );
      expect(await ctx.counterModel.countDocuments()).toBe(0);

      const responses = await Promise.all(
        windows.map((w) => post(orderBody(w._id, [{ variantId, quantity: 1 }]))),
      );

      expect(responses.map((r) => r.status)).toEqual(Array(windowsPerRound).fill(201));
      const numbers = responses.map((r) => r.body.order.orderNumber as string).sort();
      expect(numbers).toEqual(
        Array.from({ length: windowsPerRound }, (_, i) => `DW-${year}-000${i + 1}`),
      );
    }
  });

  it('skaitiklio upsert konfliktas transakcijoje yra WriteConflict (kartojamas), ne E11000', async () => {
    // Deterministinė blogiausio atvejo seka: A jau turi snapshot'ą, B sukuria skaitiklį ir
    // commit'ina, tada A daro upsert. Jei serveris čia grąžintų E11000 (be
    // TransientTransactionError žymos), withTransaction nekartotų ir klientas gautų 500.
    const counters = ctx.app.get(CountersService);
    const sessionA = await ctx.connection.startSession();
    try {
      sessionA.startTransaction();
      await ctx.orderModel.findOne().session(sessionA).exec(); // A snapshot'as
      await ctx.connection.transaction((s) => counters.next('order-test', s));

      const error = (await counters.next('order-test', sessionA).then(
        () => null,
        (e: unknown) => e,
      )) as mongo.MongoServerError | null;
      expect(error).not.toBeNull();
      expect(error!.code).not.toBe(11000);
      expect(error!.hasErrorLabel('TransientTransactionError')).toBe(true);
    } finally {
      await sessionA.abortTransaction().catch(() => undefined);
      await sessionA.endSession();
    }

    // Pakartojus (kaip tai daro withTransaction) gaunamas kitas numeris.
    await expect(ctx.connection.transaction((s) => counters.next('order-test', s))).resolves.toBe(
      2,
    );
  });
});

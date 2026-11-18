import {
  type AdminProductInput,
  type AdminSaleWindowDto,
  adminSaleWindowInputSchema,
} from '@desert-web/shared';
import type { mongo } from 'mongoose';
import request from 'supertest';
import { AdminProductsService } from '../src/admin-products/admin-products.service';
import { AdminSaleWindowsService } from '../src/admin-sale-windows/admin-sale-windows.service';
import {
  bodyFrom,
  clearDatabase,
  createProduct,
  createTestContext,
  iso,
  item,
  loginAdmin,
  orderBody,
  type ProductFixture,
  type TestContext,
  windowBody,
} from './helpers';

describe('Admin pardavimo langai: lygiagretumas', () => {
  let ctx: TestContext;
  let token: string;
  let product: ProductFixture;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  async function createWindow(body: object): Promise<AdminSaleWindowDto> {
    const res = await auth(http().post('/admin/sale-windows').send(body));
    expect(res.status).toBe(201);
    return res.body as AdminSaleWindowDto;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    token = await loginAdmin(ctx);
    product = await createProduct(ctx, {
      variants: [
        { name: '1 kg', priceCents: 2500 },
        { name: '2 kg', priceCents: 4800 },
      ],
    });
  });

  /**
   * Stock 10, 10 lygiagrečių užsakymų po 1 ir tuo pat metu admino PUT su nauju quantityTotal.
   * Po visko: quantityAvailable === quantityTotal - užsakytas kiekis, niekada < 0, jokių 500.
   */
  async function raceOrdersWithQuantityChange(newTotal: number) {
    const created = await createWindow(windowBody([item(product, 0, { quantityTotal: 10 })]));
    const opened = await auth(http().post(`/admin/sale-windows/${created.id}/open-now`));
    expect(opened.status).toBe(200);
    const w = opened.body as AdminSaleWindowDto;
    const variantId = product.variantIds[0]!;

    const body = bodyFrom(w);
    body.items[0]!.quantityTotal = newTotal;
    const orders = Array.from({ length: 10 }, () =>
      http()
        .post('/orders')
        .send(orderBody(w.id, [{ variantId, quantity: 1 }])),
    );
    const put = auth(http().put(`/admin/sale-windows/${w.id}`).send(body));
    // PUT startuoja tarp užsakymų, kad tikrai susikirstų su jų transakcijomis.
    const all = await Promise.all([...orders.slice(0, 5), put, ...orders.slice(5)]);
    const putRes = all[5]!;
    const orderRes = [...all.slice(0, 5), ...all.slice(6)];

    expect([putRes, ...orderRes].filter((r) => r.status >= 500)).toEqual([]);
    for (const r of orderRes) {
      if (r.status !== 201) expect([r.status, r.body.code]).toEqual([409, 'INSUFFICIENT_STOCK']);
    }

    const stored = await ctx.saleWindowModel.findById(w.id).lean().exec();
    const storedItem = stored!.items[0]!;
    const orderedQty = (
      await ctx.orderModel
        .find({ status: { $ne: 'cancelled' } })
        .lean()
        .exec()
    )
      .flatMap((o) => o.items)
      .reduce((sum, i) => sum + i.quantity, 0);
    expect(orderedQty).toBe(orderRes.filter((r) => r.status === 201).length);
    expect(storedItem.quantityAvailable).toBe(storedItem.quantityTotal - orderedQty);
    expect(storedItem.quantityAvailable).toBeGreaterThanOrEqual(0);
    return { putRes, orderRes, storedItem, orderedQty };
  }

  it('PUT quantityTotal 10 -> 15 lenktyniaujant su 10 užsakymų: visi pavyksta, likutis 5', async () => {
    for (let round = 0; round < 3; round++) {
      if (round > 0) {
        await clearDatabase(ctx.connection);
        token = await loginAdmin(ctx);
        product = await createProduct(ctx);
      }
      const { putRes, orderRes, storedItem } = await raceOrdersWithQuantityChange(15);
      expect(putRes.status).toBe(200);
      expect(orderRes.every((r) => r.status === 201)).toBe(true);
      expect(storedItem).toMatchObject({ quantityTotal: 15, quantityAvailable: 5 });
    }
  });

  it('PUT quantityTotal 10 -> 5 (arti parduoto) lenktyniaujant: arba pritaikomas, arba 409', async () => {
    const outcomes = new Set<string>();
    for (let round = 0; round < 5; round++) {
      if (round > 0) {
        await clearDatabase(ctx.connection);
        token = await loginAdmin(ctx);
        product = await createProduct(ctx);
      }
      const { putRes, storedItem, orderedQty } = await raceOrdersWithQuantityChange(5);
      if (putRes.status === 200) {
        // Pakeitimas pritaikytas, kai buvo parduota <= 5: likę užsakymai gavo INSUFFICIENT_STOCK.
        expect(storedItem.quantityTotal).toBe(5);
        expect(orderedQty).toBeLessThanOrEqual(5);
        outcomes.add('applied');
      } else {
        expect([putRes.status, putRes.body.code]).toEqual([409, 'QUANTITY_BELOW_SOLD']);
        expect(putRes.body.sold).toBeGreaterThan(5);
        expect(storedItem.quantityTotal).toBe(10);
        outcomes.add('rejected');
      }
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it('du persidengiantys langai skelbiami vienu metu: paskelbiamas tik vienas', async () => {
    for (let round = 0; round < 5; round++) {
      await ctx.saleWindowModel.deleteMany({});
      const a = await createWindow(
        windowBody([item(product)], { opensAt: iso(10), closesAt: iso(20) }),
      );
      const b = await createWindow(
        windowBody([item(product)], { opensAt: iso(15), closesAt: iso(25) }),
      );

      const responses = await Promise.all(
        [a, b].map((w) => auth(http().post(`/admin/sale-windows/${w.id}/publish`))),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(responses.find((r) => r.status === 409)!.body.code).toBe('WINDOW_OVERLAP');
      expect(await ctx.saleWindowModel.countDocuments({ status: 'published' })).toBe(1);
    }
  });

  describe('lenktynės su produkto redagavimu (write skew)', () => {
    const removeSecondVariant = async (): Promise<AdminProductInput> => {
      const p = await ctx.productModel.findById(product.productId).lean().exec();
      return {
        name: p!.name,
        slug: p!.slug,
        description: p!.description,
        category: p!.category,
        allergens: p!.allergens,
        specialOrder: p!.specialOrder,
        isActive: p!.isActive,
        variants: [p!.variants[0]!].map((v) => ({
          id: v._id.toString(),
          name: v.name,
          priceCents: v.priceCents,
        })),
      };
    };
    const windowWithSecondVariant = () =>
      adminSaleWindowInputSchema.parse(windowBody([item(product, 1)]));

    async function expectWriteConflict(promise: Promise<unknown>): Promise<void> {
      const error = (await promise.then(
        () => null,
        (e: unknown) => e,
      )) as mongo.MongoServerError | null;
      expect(error).not.toBeNull();
      expect(error!.hasErrorLabel('TransientTransactionError')).toBe(true);
    }

    it("langas pradėtas anksčiau, produkto PUT commit'inamas viduryje: langas gauna WriteConflict, pakartojus VARIANT_NOT_FOUND", async () => {
      const windows = ctx.app.get(AdminSaleWindowsService);
      const products = ctx.app.get(AdminProductsService);
      const input = await removeSecondVariant();

      const sessionA = await ctx.connection.startSession();
      try {
        sessionA.startTransaction();
        await ctx.saleWindowModel.findOne().session(sessionA).exec(); // A snapshot'as

        // Kitas adminas tuo metu pašalina 2 kg variantą: langų jis dar nemato, tad leidžiama.
        await products.update(product.productId.toString(), input);

        // A snapshot'e variantas dar yra, todėl validacija praeina. Be linkProducts ($inc
        // produktui) A sėkmingai commit'intų langą su jau pašalintu variantu.
        await expectWriteConflict(windows.createInSession(windowWithSecondVariant(), sessionA));
      } finally {
        await sessionA.abortTransaction().catch(() => undefined);
        await sessionA.endSession();
      }

      // Pakartojus (kaip withTransaction) variantas jau pašalintas.
      const retry = await auth(
        http()
          .post('/admin/sale-windows')
          .send(windowBody([item(product, 1)])),
      );
      expect(retry.status).toBe(400);
      expect(retry.body.code).toBe('VARIANT_NOT_FOUND');
      expect(await ctx.saleWindowModel.countDocuments()).toBe(0);
    });

    it("produkto PUT pradėtas anksčiau, langas commit'inamas viduryje: PUT gauna WriteConflict, pakartojus VARIANT_IN_USE", async () => {
      const windows = ctx.app.get(AdminSaleWindowsService);
      const products = ctx.app.get(AdminProductsService);
      const input = await removeSecondVariant();

      const sessionB = await ctx.connection.startSession();
      try {
        sessionB.startTransaction();
        await ctx.productModel.findOne().session(sessionB).exec(); // B snapshot'as

        // Kitas adminas tuo metu sukuria langą su 2 kg variantu ir commit'ina.
        const created = await windows.create(windowWithSecondVariant());
        expect(created.status).toBe('draft');

        // B snapshot'e lango dar nėra, todėl VARIANT_IN_USE patikrinimas praeina. Konfliktą
        // sukelia tik tai, kad lango transakcija pakeitė (saleWindowLinkVersion) šį produktą.
        await expectWriteConflict(
          products.updateInSession(product.productId.toString(), input, sessionB),
        );
      } finally {
        await sessionB.abortTransaction().catch(() => undefined);
        await sessionB.endSession();
      }

      const retry = await auth(
        http().put(`/admin/products/${product.productId.toString()}`).send(input),
      );
      expect(retry.status).toBe(409);
      expect(retry.body.code).toBe('VARIANT_IN_USE');
      const stored = await ctx.productModel.findById(product.productId).lean().exec();
      expect(stored!.variants).toHaveLength(2);
      expect(stored!.saleWindowLinkVersion).toBe(1);
    });
  });
});

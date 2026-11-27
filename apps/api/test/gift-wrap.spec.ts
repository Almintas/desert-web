import './env/emails';
import { randomBytes } from 'node:crypto';
import { formatEur } from '@desert-web/shared';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  bodyFrom,
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  getQuantityAvailable,
  item,
  loginAdmin,
  orderBody,
  type ProductFixture,
  type TestContext,
  uniqueCustomer,
  windowBody,
} from './helpers';

/** Dovanų pakavimas: lango nustatymai, užsakymo kopijos, klaidos, seni duomenys ir laiškai. */
describe('Dovanų pakavimas', () => {
  let ctx: TestContext;
  let token: string;
  let cake: ProductFixture;
  let macarons: ProductFixture;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const post = (body: object) => http().post('/orders').send(body);
  const createWindow = (body: object) => auth(http().post('/admin/sale-windows').send(body));
  const updateWindow = (id: string, body: object) =>
    auth(http().put(`/admin/sale-windows/${id}`).send(body));
  const getWindow = (id: string) => auth(http().get(`/admin/sale-windows/${id}`));

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    ctx.emails.clear();
    token = await loginAdmin(ctx);
    cake = await createProduct(ctx, { name: 'Medaus tortas' });
    macarons = await createProduct(ctx, {
      name: 'Makaronai',
      variants: [{ name: '6 vnt.', priceCents: 900 }],
    });
  });

  /** Atidarytas langas: tortas 20,00 € ir makaronai 9,00 €, pakavimas 2,00 € (numatyta). */
  function openWindow(
    options: {
      giftWrap?: { enabled: boolean; priceCents: number };
      macaronsAllowed?: boolean;
    } = {},
  ) {
    return createSaleWindow(ctx, {
      items: [
        { productId: cake.productId, variantId: cake.variantIds[0]!, priceCents: 2000 },
        {
          productId: macarons.productId,
          variantId: macarons.variantIds[0]!,
          priceCents: 900,
          giftWrapAllowed: options.macaronsAllowed,
        },
      ],
      giftWrap: options.giftWrap ?? { enabled: true, priceCents: 200 },
    });
  }

  describe('užsakymas su pakavimu', () => {
    it('išsaugo eilutės kopijas ir sumas: prekės + pakavimas', async () => {
      const w = await openWindow();
      const res = await post(
        orderBody(w._id, [
          { variantId: cake.variantIds[0]!, quantity: 3, giftWrapQuantity: 2 },
          { variantId: macarons.variantIds[0]!, quantity: 1 },
        ]),
      );

      expect(res.status).toBe(201);
      const { order } = res.body;
      expect(order.items).toEqual([
        expect.objectContaining({
          variantId: cake.variantIds[0]!.toString(),
          unitPriceCents: 2000,
          quantity: 3,
          lineTotalCents: 6000, // tik prekės
          giftWrapQuantity: 2,
          giftWrapUnitPriceCents: 200,
          giftWrapTotalCents: 400,
        }),
        expect.objectContaining({
          variantId: macarons.variantIds[0]!.toString(),
          lineTotalCents: 900,
          giftWrapQuantity: 0,
          giftWrapUnitPriceCents: 0,
          giftWrapTotalCents: 0,
        }),
      ]);
      expect(order.itemsTotalCents).toBe(6900);
      expect(order.giftWrapTotalCents).toBe(400);
      expect(order.totalCents).toBe(7300);

      // Pakavimas kiekių nekeičia: rezervuojami tik vienetai.
      expect(await getQuantityAvailable(ctx, w._id, cake.variantIds[0]!)).toBe(7);

      const stored = await ctx.orderModel.findById(order.id).lean().exec();
      expect(stored).toMatchObject({ itemsTotalCents: 6900, giftWrapTotalCents: 400 });
      expect(stored?.items[0]).toMatchObject({
        giftWrapQuantity: 2,
        giftWrapUnitPriceCents: 200,
        giftWrapTotalCents: 400,
      });

      // Pirkėjo užsakymo puslapis gauna tuos pačius laukus.
      const view = await http().get(`/orders/access/${res.body.accessToken}`);
      expect(view.body).toMatchObject({
        itemsTotalCents: 6900,
        giftWrapTotalCents: 400,
        totalCents: 7300,
      });
      expect(view.body.items[0]).toMatchObject({ giftWrapQuantity: 2 });
    });

    it('be giftWrapQuantity: nulinis pakavimas (seni klientai veikia kaip anksčiau)', async () => {
      const w = await openWindow();
      const res = await post(orderBody(w._id, [{ variantId: cake.variantIds[0]!, quantity: 2 }]));
      expect(res.status).toBe(201);
      expect(res.body.order).toMatchObject({
        itemsTotalCents: 4000,
        giftWrapTotalCents: 0,
        totalCents: 4000,
      });
    });

    it('kainos pakeitimas po užsakymo esamo užsakymo nekeičia; naujas gauna naują kainą', async () => {
      const created = await createWindow(
        windowBody([item(cake), item(macarons)], {
          opensAt: new Date(Date.now() - 60_000).toISOString(),
          giftWrap: { enabled: true, priceCents: 200 },
        }),
      );
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      expect((await auth(http().post(`/admin/sale-windows/${id}/publish`))).status).toBe(200);

      const customer = uniqueCustomer();
      const first = orderBody(
        id,
        [{ variantId: cake.variantIds[0]!, quantity: 2, giftWrapQuantity: 1 }],
        { customer },
      );
      const res = await post(first);
      expect(res.status).toBe(201);
      expect(res.body.order.giftWrapTotalCents).toBe(200);

      // Atidarytame lange kaina keičiama laisvai.
      const window = (await getWindow(id)).body;
      const updated = await updateWindow(
        id,
        bodyFrom(window, { giftWrap: { enabled: true, priceCents: 350 } }),
      );
      expect(updated.status).toBe(200);
      expect(updated.body.giftWrap).toEqual({ enabled: true, priceCents: 350 });

      const old = await ctx.orderModel.findById(res.body.order.id).lean().exec();
      expect(old?.items[0]).toMatchObject({ giftWrapUnitPriceCents: 200, giftWrapTotalCents: 200 });
      expect(old?.totalCents).toBe(4000 + 200);

      // Pakartota užklausa (tas pats clientRequestId) grąžina tą patį užsakymą su sena kaina.
      const replay = await post(first);
      expect(replay.status).toBe(200);
      expect(replay.body.order.id).toBe(res.body.order.id);
      expect(replay.body.order.giftWrapTotalCents).toBe(200);

      const second = await post(
        orderBody(id, [{ variantId: cake.variantIds[0]!, quantity: 1, giftWrapQuantity: 1 }]),
      );
      expect(second.status).toBe(201);
      expect(second.body.order.items[0].giftWrapUnitPriceCents).toBe(350);
      expect(second.body.order.totalCents).toBe(2000 + 350);
    });

    it('atšaukus užsakymą grąžinami tik vienetai (pakavimas kiekių neturi)', async () => {
      const w = await openWindow();
      const res = await post(
        orderBody(w._id, [{ variantId: cake.variantIds[0]!, quantity: 3, giftWrapQuantity: 3 }]),
      );
      expect(res.status).toBe(201);
      const cancel = await auth(http().post(`/admin/orders/${res.body.order.id}/cancel`)).send({});
      expect(cancel.status).toBe(200);
      expect(await getQuantityAvailable(ctx, w._id, cake.variantIds[0]!)).toBe(10);
      expect(cancel.body.giftWrapTotalCents).toBe(600);
    });
  });

  describe('klaidos', () => {
    it('lange pakavimas išjungtas: 409 GIFT_WRAP_UNAVAILABLE, niekas nerezervuojama', async () => {
      const w = await openWindow({ giftWrap: { enabled: false, priceCents: 200 } });
      const res = await post(
        orderBody(w._id, [
          { variantId: cake.variantIds[0]!, quantity: 2, giftWrapQuantity: 1 },
          { variantId: macarons.variantIds[0]!, quantity: 1, giftWrapQuantity: 1 },
        ]),
      );

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('GIFT_WRAP_UNAVAILABLE');
      expect(res.body.details.items).toEqual([
        { variantId: cake.variantIds[0]!.toString(), requested: 1, allowed: 0 },
        { variantId: macarons.variantIds[0]!.toString(), requested: 1, allowed: 0 },
      ]);
      expect(await getQuantityAvailable(ctx, w._id, cake.variantIds[0]!)).toBe(10);
      expect(await ctx.orderModel.countDocuments()).toBe(0);
    });

    it('senas langas be giftWrap lauko: pakavimas negalimas (409)', async () => {
      const w = await createSaleWindow(ctx, {
        items: [{ productId: cake.productId, variantId: cake.variantIds[0]! }],
      });
      const res = await post(
        orderBody(w._id, [{ variantId: cake.variantIds[0]!, quantity: 1, giftWrapQuantity: 1 }]),
      );
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('GIFT_WRAP_UNAVAILABLE');
    });

    it('prekė pakavimo neleidžia: 409 tik dėl tos prekės', async () => {
      const w = await openWindow({ macaronsAllowed: false });
      const res = await post(
        orderBody(w._id, [
          { variantId: cake.variantIds[0]!, quantity: 1, giftWrapQuantity: 1 },
          { variantId: macarons.variantIds[0]!, quantity: 2, giftWrapQuantity: 2 },
        ]),
      );
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('GIFT_WRAP_UNAVAILABLE');
      expect(res.body.details.items).toEqual([
        { variantId: macarons.variantIds[0]!.toString(), requested: 2, allowed: 0 },
      ]);

      // Be pakavimo ta pati prekė užsakoma.
      const ok = await post(
        orderBody(w._id, [
          { variantId: cake.variantIds[0]!, quantity: 1, giftWrapQuantity: 1 },
          { variantId: macarons.variantIds[0]!, quantity: 2 },
        ]),
      );
      expect(ok.status).toBe(201);
    });

    it('giftWrapQuantity > quantity: 400 validacijos klaida', async () => {
      const w = await openWindow();
      const res = await post(
        orderBody(w._id, [{ variantId: cake.variantIds[0]!, quantity: 2, giftWrapQuantity: 3 }]),
      );
      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual([
        {
          path: 'items.0.giftWrapQuantity',
          message: 'Supakuoti kaip dovaną galima ne daugiau vienetų, nei užsakyta',
        },
      ]);
    });

    it.each([[-1], [1.5]])('giftWrapQuantity %p: 400', async (giftWrapQuantity) => {
      const w = await openWindow();
      const res = await post(
        orderBody(w._id, [{ variantId: cake.variantIds[0]!, quantity: 2, giftWrapQuantity }]),
      );
      expect(res.status).toBe(400);
      expect(res.body.issues[0].path).toBe('items.0.giftWrapQuantity');
    });
  });

  describe('seni užsakymai be pakavimo laukų', () => {
    it('DTO gauna nulius, itemsTotalCents = totalCents', async () => {
      const w = await openWindow();
      const accessToken = randomBytes(24).toString('base64url');
      const now = new Date();
      // Tiesiai į kolekciją, be Mongoose numatytųjų reikšmių: kaip prieš šį pakeitimą.
      const { insertedId } = await ctx.orderModel.collection.insertOne({
        orderNumber: 'DW-2025-0001',
        saleWindowId: w._id,
        customer: {
          name: 'Ona',
          email: 'ona@example.com',
          emailNormalized: 'ona@example.com',
          phone: '+37060000001',
          phoneNormalized: '+37060000001',
        },
        items: [
          {
            productId: cake.productId,
            variantId: cake.variantIds[0]!,
            productName: 'Medaus tortas',
            variantName: '1 kg',
            unitPriceCents: 2000,
            quantity: 2,
            lineTotalCents: 4000,
          },
        ],
        totalCents: 4000,
        currency: 'EUR',
        fulfillment: { method: 'pickup' },
        status: 'pending',
        accessToken,
        createdAt: now,
        updatedAt: now,
      });

      const zeros = { giftWrapQuantity: 0, giftWrapUnitPriceCents: 0, giftWrapTotalCents: 0 };
      const view = await http().get(`/orders/access/${accessToken}`);
      expect(view.status).toBe(200);
      expect(view.body).toMatchObject({
        itemsTotalCents: 4000,
        giftWrapTotalCents: 0,
        totalCents: 4000,
      });
      expect(view.body.items[0]).toMatchObject({ lineTotalCents: 4000, ...zeros });

      const admin = await auth(http().get(`/admin/orders/${insertedId.toString()}`));
      expect(admin.status).toBe(200);
      expect(admin.body).toMatchObject({ itemsTotalCents: 4000, giftWrapTotalCents: 0 });
      expect(admin.body.items[0]).toMatchObject(zeros);

      const list = await auth(http().get('/admin/orders'));
      expect(list.body.items[0]).toMatchObject({ giftWrapQuantity: 0, totalCents: 4000 });
    });

    it('admin sąraše giftWrapQuantity: supakuotų vienetų suma', async () => {
      const w = await openWindow();
      await post(
        orderBody(w._id, [
          { variantId: cake.variantIds[0]!, quantity: 3, giftWrapQuantity: 2 },
          { variantId: macarons.variantIds[0]!, quantity: 2, giftWrapQuantity: 1 },
        ]),
      ).expect(201);
      const list = await auth(http().get('/admin/orders'));
      expect(list.body.items[0]).toMatchObject({ itemCount: 5, giftWrapQuantity: 3 });
    });
  });

  describe('admin lango nustatymai', () => {
    it.each<[string, object, string]>([
      [
        'įjungtas be kainos',
        { enabled: true, priceCents: 0 },
        'Įjungus pakavimą, kaina turi būti didesnė už 0',
      ],
      [
        'kaina > 100,00 €',
        { enabled: true, priceCents: 10_001 },
        'Kaina negali būti didesnė nei 100,00 €',
      ],
      ['kaina ne centais', { enabled: true, priceCents: 1.5 }, 'Kaina turi būti nurodyta centais'],
      ['neigiama kaina', { enabled: false, priceCents: -1 }, 'Kaina negali būti neigiama'],
    ])('%s: 400 su klaida prie giftWrap.priceCents', async (_name, giftWrap, message) => {
      const res = await createWindow(windowBody([item(cake)], { giftWrap } as object));
      expect(res.status).toBe(400);
      expect(res.body.issues).toContainEqual({ path: 'giftWrap.priceCents', message });
    });

    it('išsaugo pakavimą ir prekių leidimus; išjungtas gali turėti kainą (ji išlieka)', async () => {
      const res = await createWindow(
        windowBody([item(cake), item(macarons, 0, { giftWrapAllowed: false })], {
          giftWrap: { enabled: true, priceCents: 10_000 },
        }),
      );
      expect(res.status).toBe(201);
      expect(res.body.giftWrap).toEqual({ enabled: true, priceCents: 10_000 });
      expect(res.body.items.map((i: { giftWrapAllowed: boolean }) => i.giftWrapAllowed)).toEqual([
        true,
        false,
      ]);

      const off = await updateWindow(
        res.body.id,
        bodyFrom(res.body, { giftWrap: { enabled: false, priceCents: 250 } }),
      );
      expect(off.status).toBe(200);
      expect(off.body.giftWrap).toEqual({ enabled: false, priceCents: 250 });
      expect(off.body.items[1].giftWrapAllowed).toBe(false);
    });

    it('senas langas be laukų: admin DTO išjungtas, prekės leidžiamos', async () => {
      const w = await createSaleWindow(ctx, {
        items: [{ productId: cake.productId, variantId: cake.variantIds[0]! }],
      });
      await ctx.saleWindowModel.collection.updateOne(
        { _id: w._id },
        { $unset: { giftWrap: '', 'items.$[].giftWrapAllowed': '' } },
      );
      const res = await getWindow(w._id.toString());
      expect(res.body.giftWrap).toEqual({ enabled: false, priceCents: 0 });
      expect(res.body.items[0].giftWrapAllowed).toBe(true);
    });
  });

  describe('viešas langas (/sale-windows/current)', () => {
    const current = () => http().get('/sale-windows/current');

    it('išjungtas: giftWrap null (kaina neatskleidžiama)', async () => {
      await openWindow({ giftWrap: { enabled: false, priceCents: 250 } });
      const res = await current();
      expect(res.body.open.giftWrap).toBeNull();
      expect(JSON.stringify(res.body.open)).not.toContain('"priceCents":250');
    });

    it('įjungtas: kaina ir prekių leidimai', async () => {
      await openWindow({ giftWrap: { enabled: true, priceCents: 250 }, macaronsAllowed: false });
      const res = await current();
      expect(res.body.open.giftWrap).toEqual({ priceCents: 250 });
      expect(
        res.body.open.items.map((i: { giftWrapAllowed: boolean }) => i.giftWrapAllowed),
      ).toEqual([true, false]);
    });

    it('senas langas be laukų: giftWrap null, prekės giftWrapAllowed = true', async () => {
      const w = await createSaleWindow(ctx, {
        items: [{ productId: cake.productId, variantId: cake.variantIds[0]! }],
      });
      await ctx.saleWindowModel.collection.updateOne(
        { _id: w._id },
        { $unset: { giftWrap: '', 'items.$[].giftWrapAllowed': '' } },
      );
      const res = await current();
      expect(res.body.open.giftWrap).toBeNull();
      expect(res.body.open.items[0].giftWrapAllowed).toBe(true);
    });
  });

  describe('laiškai', () => {
    it('pirkėjo ir pardavėjo laiškuose: pakavimo eilutė ir sumų išskaidymas', async () => {
      const w = await openWindow();
      await post(
        orderBody(w._id, [{ variantId: cake.variantIds[0]!, quantity: 3, giftWrapQuantity: 2 }]),
      ).expect(201);
      await ctx.notifications.whenIdle();

      expect(ctx.emails.sent).toHaveLength(2);
      for (const email of ctx.emails.sent) {
        for (const body of [email.html, email.text]) {
          expect(body).toContain('Supakuoti kaip dovaną: 2 vnt.');
          expect(body).toContain('Prekės');
          expect(body).toContain('Dovanų pakavimas (2 vnt.)');
          expect(body).toContain(formatEur(400));
          expect(body).toContain(formatEur(6400));
        }
      }
    });
  });

  it('nežinomas variantas su pakavimu: pirmiau ITEM_NOT_IN_WINDOW', async () => {
    const w = await openWindow({ giftWrap: { enabled: false, priceCents: 0 } });
    const res = await post(
      orderBody(w._id, [{ variantId: new Types.ObjectId(), quantity: 1, giftWrapQuantity: 1 }]),
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ITEM_NOT_IN_WINDOW');
  });
});

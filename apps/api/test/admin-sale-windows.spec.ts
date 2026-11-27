import type {
  AdminSaleWindowDto,
  AdminSaleWindowInputBody,
  CurrentSaleWindowResponse,
} from '@desert-web/shared';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  bodyFrom,
  clearDatabase,
  createProduct,
  createTestContext,
  iso,
  item,
  type ItemBody,
  loginAdmin,
  orderBody,
  type ProductFixture,
  type TestContext,
  windowBody,
} from './helpers';

describe('Admin pardavimo langai (/admin/sale-windows)', () => {
  let ctx: TestContext;
  let token: string;
  let cake: ProductFixture;
  let macarons: ProductFixture;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const list = () => auth(http().get('/admin/sale-windows'));
  const getOne = (id: string) => auth(http().get(`/admin/sale-windows/${id}`));
  const create = (body: object) => auth(http().post('/admin/sale-windows').send(body));
  const update = (id: string, body: object) =>
    auth(http().put(`/admin/sale-windows/${id}`).send(body));
  const action = (id: string, name: string) =>
    auth(http().post(`/admin/sale-windows/${id}/${name}`));
  const remove = (id: string) => auth(http().delete(`/admin/sale-windows/${id}`));
  const order = (windowId: string, variantId: Types.ObjectId | string, quantity = 1) =>
    http()
      .post('/orders')
      .send(orderBody(windowId, [{ variantId, quantity }]));

  async function createOk(
    items: ItemBody[] = [item(cake)],
    overrides: Partial<AdminSaleWindowInputBody> = {},
  ): Promise<AdminSaleWindowDto> {
    const res = await create(windowBody(items, overrides));
    expect(res.status).toBe(201);
    return res.body as AdminSaleWindowDto;
  }

  async function actionOk(id: string, name: string): Promise<AdminSaleWindowDto> {
    const res = await action(id, name);
    expect(res.status).toBe(200);
    return res.body as AdminSaleWindowDto;
  }

  /** Atidarytas langas su užsakymais: `orders` užsakymų po 1 vnt. pirmos prekės. */
  async function openWindowWithOrders(
    orders: number,
    items: ItemBody[] = [item(cake), item(macarons)],
  ): Promise<AdminSaleWindowDto> {
    const w = await createOk(items);
    await actionOk(w.id, 'open-now');
    for (let i = 0; i < orders; i++) {
      expect((await order(w.id, items[0]!.variantId)).status).toBe(201);
    }
    return (await getOne(w.id)).body as AdminSaleWindowDto;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    token = await loginAdmin(ctx, 'staff');
    cake = await createProduct(ctx, {
      name: 'Medaus tortas',
      variants: [
        { name: '1 kg', priceCents: 2500 },
        { name: '2 kg', priceCents: 4800 },
      ],
    });
    macarons = await createProduct(ctx, { name: 'Makaronai' });
  });

  describe('autentifikacija', () => {
    const id = new Types.ObjectId().toString();
    it.each([
      ['get', '/admin/sale-windows'],
      ['get', `/admin/sale-windows/${id}`],
      ['post', '/admin/sale-windows'],
      ['put', `/admin/sale-windows/${id}`],
      ['post', `/admin/sale-windows/${id}/publish`],
      ['post', `/admin/sale-windows/${id}/unpublish`],
      ['post', `/admin/sale-windows/${id}/cancel`],
      ['post', `/admin/sale-windows/${id}/open-now`],
      ['post', `/admin/sale-windows/${id}/close-now`],
      ['delete', `/admin/sale-windows/${id}`],
    ] as const)('%s %s be tokeno: 401', async (method, path) => {
      expect((await http()[method](path).send({})).status).toBe(401);
    });
  });

  describe('POST (kūrimas)', () => {
    it('sukuria juodraštį: 201 su AdminSaleWindowDto', async () => {
      const body = windowBody([
        item(cake, 0, { priceCents: 2300, quantityTotal: 5 }),
        item(macarons),
      ]);
      const res = await create(body);

      expect(res.status).toBe(201);
      const dto = res.body as AdminSaleWindowDto;
      expect(dto).toMatchObject({
        title: 'Kalėdinis pardavimas',
        status: 'draft',
        phase: 'draft',
        opensAt: body.opensAt,
        closesAt: body.closesAt,
        ordersCount: 0,
        fulfillment: { pickupAvailable: true, deliveryAvailable: false },
        // Be giftWrap įvestyje pakavimas išjungtas.
        giftWrap: { enabled: false, priceCents: 0 },
      });
      expect(dto.items).toEqual([
        {
          productId: cake.productId.toString(),
          variantId: cake.variantIds[0]!.toString(),
          productName: 'Medaus tortas',
          productSlug: expect.any(String),
          variantName: '1 kg',
          description: '',
          allergens: [],
          imageUrl: null,
          images: [],
          productActive: true,
          priceCents: 2300,
          quantityTotal: 5,
          quantityAvailable: 5,
          sold: 0,
          giftWrapAllowed: true,
          ordersCount: 0,
        },
        expect.objectContaining({ variantId: macarons.variantIds[0]!.toString(), sold: 0 }),
      ]);
      expect((await getOne(dto.id)).body).toEqual(dto);
    });

    it('status įvestyje ignoruojamas: visada juodraštis', async () => {
      const res = await create({ ...windowBody([item(cake)]), status: 'published' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');
    });

    it.each<[string, (b: AdminSaleWindowInputBody) => object, string]>([
      ['pabaiga ne vėliau nei pradžia', (b) => ({ ...b, closesAt: b.opensAt }), 'closesAt'],
      [
        'nei atsiėmimo, nei pristatymo',
        (b) => ({ ...b, fulfillment: { pickupAvailable: false, deliveryAvailable: false } }),
        'fulfillment',
      ],
      [
        'ta pati prekė du kartus',
        (b) => ({ ...b, items: [b.items[0], b.items[0]] }),
        'items.1.variantId',
      ],
      ['be prekių', (b) => ({ ...b, items: [] }), 'items'],
      ['netinkama data', (b) => ({ ...b, opensAt: '2026-12-20T10:00' }), 'opensAt'],
      [
        'kiekis trupmeninis',
        (b) => ({ ...b, items: [{ ...b.items[0], quantityTotal: 1.5 }] }),
        'items.0.quantityTotal',
      ],
    ])('%s: 400 su issues', async (_name, change, path) => {
      const res = await create(change(windowBody([item(cake)])));
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Netinkami duomenys');
      expect((res.body.issues as { path: string }[]).map((i) => i.path)).toContain(path);
    });

    it('nežinomas produktas: 400 PRODUCT_NOT_FOUND', async () => {
      const res = await create(
        windowBody([item(cake, 0, { productId: new Types.ObjectId().toString() })]),
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('svetimas variantas: 400 VARIANT_NOT_FOUND', async () => {
      const foreign = macarons.variantIds[0]!.toString();
      const res = await create(windowBody([item(cake, 0, { variantId: foreign })]));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VARIANT_NOT_FOUND', variantId: foreign });
    });

    it('archyvuotas produktas: 400 PRODUCT_INACTIVE', async () => {
      await ctx.productModel.updateOne({ _id: cake.productId }, { isActive: false });
      const res = await create(windowBody([item(cake)]));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PRODUCT_INACTIVE');
      expect(await ctx.saleWindowModel.countDocuments()).toBe(0);
    });
  });

  describe('GET', () => {
    it('sąrašas: naujausias opensAt pirmas, su phase ir parduotais kiekiais', async () => {
      const later = await createOk([item(cake)], {
        title: 'Vėlesnis',
        opensAt: iso(100),
        closesAt: iso(110),
      });
      const open = await openWindowWithOrders(2, [item(cake, 0, { quantityTotal: 5 })]);
      const res = await list();
      expect(res.status).toBe(200);
      const windows = res.body as AdminSaleWindowDto[];
      expect(windows.map((w) => w.id)).toEqual([later.id, open.id]);
      expect(windows[1]).toMatchObject({ phase: 'open', status: 'published', ordersCount: 2 });
      expect(windows[1]!.items[0]).toMatchObject({
        quantityTotal: 5,
        quantityAvailable: 3,
        sold: 2,
        ordersCount: 2,
      });
    });

    it('nežinomas ar netinkamas id: 404', async () => {
      const res = await getOne(new Types.ObjectId().toString());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SALE_WINDOW_NOT_FOUND');
      expect((await getOne('ne-id')).status).toBe(404);
      expect((await action('ne-id', 'publish')).status).toBe(404);
      expect((await update(new Types.ObjectId().toString(), windowBody([item(cake)]))).status).toBe(
        404,
      );
    });
  });

  describe('publish ir persidengimas', () => {
    it('juodraštis -> paskelbtas', async () => {
      const w = await createOk();
      const published = await actionOk(w.id, 'publish');
      expect(published).toMatchObject({ status: 'published', phase: 'upcoming' });
    });

    it('paskelbti langai gali persidengti', async () => {
      const first = await createOk([item(cake)], { opensAt: iso(10), closesAt: iso(20) });
      await actionOk(first.id, 'publish');
      const second = await createOk([item(cake)], { opensAt: iso(15), closesAt: iso(30) });
      expect(await actionOk(second.id, 'publish')).toMatchObject({ status: 'published' });
    });

    it('paskelbti jau paskelbtą: 409 INVALID_STATUS; pasibaigusio juodraščio: 409', async () => {
      const w = await createOk();
      await actionOk(w.id, 'publish');
      expect((await action(w.id, 'publish')).body.code).toBe('INVALID_STATUS');

      const ended = await createOk([item(cake)], { opensAt: iso(-3), closesAt: iso(-1) });
      const res = await action(ended.id, 'publish');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_STATUS');
    });

    it('paskelbto lango laikus galima keisti į persidengiančius su kitu paskelbtu', async () => {
      const first = await createOk([item(cake)], { opensAt: iso(10), closesAt: iso(20) });
      const second = await createOk([item(cake)], { opensAt: iso(30), closesAt: iso(40) });
      await actionOk(first.id, 'publish');
      const published = await actionOk(second.id, 'publish');

      const opensAt = iso(15);
      const res = await update(second.id, bodyFrom(published, { opensAt }));
      expect(res.status).toBe(200);
      expect(res.body.opensAt).toBe(opensAt);
    });
  });

  describe('kiekiai ir kainos (PUT)', () => {
    it('quantityTotal keitimas pakeičia quantityAvailable tiek pat; mažiau nei parduota: 409', async () => {
      const w = await openWindowWithOrders(3);
      expect(w.items[0]).toMatchObject({ quantityTotal: 10, quantityAvailable: 7, sold: 3 });

      const raised = await update(
        w.id,
        bodyFrom(w, {
          items: [{ ...bodyFrom(w).items[0]!, quantityTotal: 15 }, bodyFrom(w).items[1]!],
        }),
      );
      expect(raised.status).toBe(200);
      expect(raised.body.items[0]).toMatchObject({
        quantityTotal: 15,
        quantityAvailable: 12,
        sold: 3,
      });

      const below = bodyFrom(w);
      below.items[0]!.quantityTotal = 2;
      const res = await update(w.id, below);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        code: 'QUANTITY_BELOW_SOLD',
        variantId: w.items[0]!.variantId,
        sold: 3,
        requestedTotal: 2,
      });
      expect((await getOne(w.id)).body.items[0]).toMatchObject({
        quantityTotal: 15,
        quantityAvailable: 12,
      });

      const exact = bodyFrom(w);
      exact.items[0]!.quantityTotal = 3;
      const ok = await update(w.id, exact);
      expect(ok.status).toBe(200);
      expect(ok.body.items[0]).toMatchObject({ quantityTotal: 3, quantityAvailable: 0, sold: 3 });
      expect((await order(w.id, w.items[0]!.variantId)).body.code).toBe('INSUFFICIENT_STOCK');
    });

    it('kainos keitimas veikia tik naujus užsakymus', async () => {
      const w = await openWindowWithOrders(1);
      const body = bodyFrom(w);
      body.items[0]!.priceCents = 2999;
      expect((await update(w.id, body)).status).toBe(200);

      const newOrder = await order(w.id, w.items[0]!.variantId);
      expect(newOrder.body.order.items[0].unitPriceCents).toBe(2999);
      const prices = (await ctx.orderModel.find().sort({ createdAt: 1 }).lean().exec()).map(
        (o) => o.items[0]!.unitPriceCents,
      );
      expect(prices).toEqual([2000, 2999]);
    });

    it('išimti prekę su užsakymais: 409 ITEM_HAS_ORDERS; be užsakymų: galima', async () => {
      const w = await openWindowWithOrders(1);
      const [withOrders, withoutOrders] = bodyFrom(w).items;

      const res = await update(w.id, bodyFrom(w, { items: [withoutOrders!] }));
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'ITEM_HAS_ORDERS', variantId: withOrders!.variantId });
      expect((await getOne(w.id)).body.items).toHaveLength(2);

      const ok = await update(w.id, bodyFrom(w, { items: [withOrders!] }));
      expect(ok.status).toBe(200);
      expect(ok.body.items.map((i: { variantId: string }) => i.variantId)).toEqual([
        withOrders!.variantId,
      ]);
    });

    it('prekę, kurios visi užsakymai atšaukti, išimti galima', async () => {
      const w = await openWindowWithOrders(1);
      await ctx.orderModel.updateMany({}, { status: 'cancelled' });
      const res = await update(w.id, bodyFrom(w, { items: [bodyFrom(w).items[1]!] }));
      expect(res.status).toBe(200);
    });

    it('nauja prekė: quantityAvailable = quantityTotal', async () => {
      const w = await createOk([item(cake)]);
      const res = await update(
        w.id,
        bodyFrom(w, { items: [...bodyFrom(w).items, item(cake, 1, { quantityTotal: 4 })] }),
      );
      expect(res.status).toBe(200);
      expect(res.body.items[1]).toMatchObject({ quantityTotal: 4, quantityAvailable: 4, sold: 0 });
    });

    it('archyvuotas produktas lange lieka ir parduodamas, bet naujai pridėti negalima', async () => {
      const w = await openWindowWithOrders(0, [item(cake)]);
      await ctx.productModel.updateOne({ _id: cake.productId }, { isActive: false });

      const same = await update(w.id, bodyFrom(w, { title: 'Pervadintas' }));
      expect(same.status).toBe(200);
      expect(same.body.items[0].productActive).toBe(false);
      expect((await order(w.id, cake.variantIds[0]!)).status).toBe(201);

      const addOther = await update(
        w.id,
        bodyFrom(w, { items: [...bodyFrom(w).items, item(cake, 1)] }),
      );
      expect(addOther.status).toBe(400);
      expect(addOther.body).toMatchObject({
        code: 'PRODUCT_INACTIVE',
        variantId: cake.variantIds[1]!.toString(),
      });
    });
  });

  describe('būsenos', () => {
    it('unpublish: be užsakymų -> juodraštis; su užsakymais: 409 WINDOW_HAS_ORDERS', async () => {
      const w = await createOk();
      await actionOk(w.id, 'publish');
      expect((await actionOk(w.id, 'unpublish')).status).toBe('draft');
      expect((await action(w.id, 'unpublish')).body.code).toBe('INVALID_STATUS');

      const withOrders = await openWindowWithOrders(1);
      const res = await action(withOrders.id, 'unpublish');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('WINDOW_HAS_ORDERS');
    });

    it('cancel: juodraštis ir paskelbtas be užsakymų; su užsakymais: 409', async () => {
      const draft = await createOk();
      expect((await actionOk(draft.id, 'cancel')).status).toBe('cancelled');
      const published = await createOk([item(cake)], { opensAt: iso(100), closesAt: iso(110) });
      await actionOk(published.id, 'publish');
      expect((await actionOk(published.id, 'cancel')).phase).toBe('cancelled');

      const withOrders = await openWindowWithOrders(1);
      const res = await action(withOrders.id, 'cancel');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('WINDOW_HAS_ORDERS');
    });

    it('atšauktas langas tik skaitomas: visi keitimai 409 WINDOW_CANCELLED', async () => {
      const w = await createOk();
      await actionOk(w.id, 'cancel');
      for (const name of ['publish', 'unpublish', 'cancel', 'open-now', 'close-now']) {
        const res = await action(w.id, name);
        expect([name, res.status, res.body.code]).toEqual([name, 409, 'WINDOW_CANCELLED']);
      }
      expect((await update(w.id, bodyFrom(w))).body.code).toBe('WINDOW_CANCELLED');
      expect((await remove(w.id)).body.code).toBe('WINDOW_CANCELLED');
      expect((await getOne(w.id)).status).toBe(200);
    });

    it('DELETE: juodraštis be užsakymų -> 204; paskelbtas: 409; su užsakymais: 409', async () => {
      const draft = await createOk();
      expect((await remove(draft.id)).status).toBe(204);
      expect((await getOne(draft.id)).status).toBe(404);

      const published = await createOk();
      await actionOk(published.id, 'publish');
      expect((await remove(published.id)).body.code).toBe('INVALID_STATUS');

      // Juodraštis su užsakymais įprastai neįmanomas (unpublish to neleidžia), bet API saugosi.
      const draftWithOrders = await createOk();
      await ctx.orderModel.create({
        orderNumber: 'DW-TEST-1',
        saleWindowId: new Types.ObjectId(draftWithOrders.id),
        customer: {
          name: 'Ona',
          email: 'ona@example.com',
          emailNormalized: 'ona@example.com',
          phone: '+37060000000',
          phoneNormalized: '+37060000000',
        },
        items: [],
        totalCents: 0,
        fulfillment: { method: 'pickup' },
        accessToken: 'x'.repeat(32),
      });
      const res = await remove(draftWithOrders.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('WINDOW_HAS_ORDERS');
    });

    it('open-now ir close-now: užsakymai priimami tik tarp jų', async () => {
      const w = await createOk();
      const variantId = cake.variantIds[0]!;
      expect((await order(w.id, variantId)).body.code).toBe('SALE_WINDOW_CLOSED');

      const before = Date.now();
      const opened = await actionOk(w.id, 'open-now');
      expect(opened).toMatchObject({ status: 'published', phase: 'open', closesAt: w.closesAt });
      expect(new Date(opened.opensAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(new Date(opened.opensAt).getTime()).toBeLessThanOrEqual(Date.now());
      expect((await action(w.id, 'open-now')).body.code).toBe('INVALID_STATUS');
      expect((await order(w.id, variantId)).status).toBe(201);

      const closed = await actionOk(w.id, 'close-now');
      expect(closed.phase).toBe('closed');
      const refused = await order(w.id, variantId);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('SALE_WINDOW_CLOSED');
      expect((await action(w.id, 'close-now')).body.code).toBe('INVALID_STATUS');
      expect((await action(w.id, 'open-now')).body.code).toBe('INVALID_STATUS'); // pabaiga praėjo
    });

    it('open-now paskelbtam būsimam langui; kitas langas gali būti atidarytas tuo pačiu metu', async () => {
      const upcoming = await createOk([item(cake)], { opensAt: iso(10), closesAt: iso(20) });
      await actionOk(upcoming.id, 'publish');
      expect((await actionOk(upcoming.id, 'open-now')).phase).toBe('open');

      const other = await createOk([item(cake)], {
        title: 'Kitas',
        opensAt: iso(15),
        closesAt: iso(30),
      });
      expect((await actionOk(other.id, 'open-now')).phase).toBe('open');

      const v = cake.variantIds[0]!;
      expect((await order(upcoming.id, v)).status).toBe(201);
      expect((await order(other.id, v)).status).toBe(201);
    });

    it('close-now neatidarytam langui: 409 INVALID_STATUS', async () => {
      const w = await createOk();
      expect((await action(w.id, 'close-now')).body.code).toBe('INVALID_STATUS');
      await actionOk(w.id, 'publish');
      expect((await action(w.id, 'close-now')).body.code).toBe('INVALID_STATUS');
    });
  });

  describe('atsiėmimas nebe lange (nustatymuose)', () => {
    it.each(['publish', 'open-now'])(
      '%s be jokios atsiėmimo informacijos lange: 200',
      async (name) => {
        const w = await createOk();
        const res = await action(w.id, name);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('published');
        expect(res.body.fulfillment).toEqual({ pickupAvailable: true, deliveryAvailable: false });
      },
    );

    it('seni lango atsiėmimo laukai nerodomi ir PUT jų neliečia', async () => {
      const w = await createOk();
      const old = {
        'fulfillment.pickupLocation': 'Vilnius',
        'fulfillment.pickupFrom': new Date('2027-01-10T08:00:00.000Z'),
        'fulfillment.pickupTo': new Date('2027-01-10T15:00:00.000Z'),
      };
      await ctx.saleWindowModel.collection.updateOne(
        { _id: new Types.ObjectId(w.id) },
        { $set: old },
      );
      const published = await actionOk(w.id, 'publish');
      expect(published.fulfillment).toEqual({ pickupAvailable: true, deliveryAvailable: false });

      const res = await update(w.id, bodyFrom(published, { title: 'Pervadintas' }));
      expect(res.status).toBe(200);
      expect(res.body.fulfillment).toEqual({ pickupAvailable: true, deliveryAvailable: false });
      const raw = await ctx.saleWindowModel.collection.findOne({ _id: new Types.ObjectId(w.id) });
      expect(raw?.fulfillment).toMatchObject({
        pickupLocation: 'Vilnius',
        pickupFrom: old['fulfillment.pickupFrom'],
        pickupTo: old['fulfillment.pickupTo'],
      });
    });
  });

  describe('PUT be pakeitimų išsaugo laikų sekundes', () => {
    const MINUTE = 60_000;
    /** Kaip admin forma: datetime-local tikslumas yra minutė. */
    const truncated = (isoValue: string) =>
      new Date(Math.floor(new Date(isoValue).getTime() / MINUTE) * MINUTE).toISOString();

    it('„Atidaryti dabar“, tada PUT be pakeitimų: opensAt lieka tiksliai toks pat', async () => {
      const w = await createOk([item(cake)]);
      const opened = await actionOk(w.id, 'open-now');
      // Su labai maža tikimybe atidaryta lygiai 00 sekundžių; tada testas vis tiek galioja.
      const body = bodyFrom(opened, {
        opensAt: truncated(opened.opensAt),
        closesAt: truncated(opened.closesAt),
      });

      const res = await update(w.id, body);
      expect(res.status).toBe(200);
      expect(res.body.opensAt).toBe(opened.opensAt);
      expect(res.body.closesAt).toBe(opened.closesAt);
      expect(res.body.phase).toBe('open');
    });

    it('tikras pakeitimas pakeičia laiką (ir sekundės dingsta)', async () => {
      const w = await createOk();
      const opened = await actionOk(w.id, 'open-now');
      const earlier = new Date(Math.floor(Date.parse(opened.opensAt) / MINUTE) * MINUTE - MINUTE);
      const res = await update(w.id, bodyFrom(opened, { opensAt: earlier.toISOString() }));
      expect(res.status).toBe(200);
      expect(res.body.opensAt).toBe(earlier.toISOString());
    });

    it('uždarius A ir tuoj pat atidarius B, B išsaugojimas be pakeitimų nepakeičia opensAt', async () => {
      // Deterministiškai toje pačioje minutėje m: A uždarytas m+20 s, B atidarytas m+30 s.
      const m = Math.floor(Date.now() / MINUTE) * MINUTE - MINUTE;
      const a = await createOk([item(cake)], { title: 'A' });
      const b = await createOk([item(cake)], { title: 'B' });
      await ctx.saleWindowModel.updateOne(
        { _id: a.id },
        { status: 'published', opensAt: new Date(m - 3_600_000), closesAt: new Date(m + 20_000) },
      );
      await ctx.saleWindowModel.updateOne(
        { _id: b.id },
        {
          status: 'published',
          opensAt: new Date(m + 30_000),
          closesAt: new Date(Date.now() + 3_600_000),
        },
      );
      const stored = (await getOne(b.id)).body as AdminSaleWindowDto;
      expect(stored.phase).toBe('open');

      const unchanged = bodyFrom(stored, { opensAt: truncated(stored.opensAt) });
      const res = await update(b.id, unchanged);
      expect(res.status).toBe(200);
      expect(res.body.opensAt).toBe(new Date(m + 30_000).toISOString());
    });
  });

  describe('viešas GET /sale-windows/current', () => {
    const current = async () =>
      (await http().get('/sale-windows/current')).body as CurrentSaleWindowResponse;

    it('rodo tik paskelbtus langus pagal fazę', async () => {
      const draft = await createOk([item(cake)], { opensAt: iso(1), closesAt: iso(2) });
      expect(await current()).toEqual({ open: null, openWindows: [], upcoming: null });

      await actionOk(draft.id, 'publish');
      let res = await current();
      expect(res.open).toBeNull();
      expect(res.upcoming).toMatchObject({ id: draft.id, phase: 'upcoming' });
      expect(res.upcoming!.items[0]).toMatchObject({ variantName: '1 kg', quantityAvailable: 10 });

      await actionOk(draft.id, 'open-now');
      expect((await order(draft.id, cake.variantIds[0]!, 2)).status).toBe(201);
      res = await current();
      expect(res.open).toMatchObject({ id: draft.id, phase: 'open' });
      expect(res.open!.items[0]!.quantityAvailable).toBe(8);
      expect(res.openWindows.map((w) => w.id)).toEqual([draft.id]);
      expect(res.upcoming).toBeNull();

      await actionOk(draft.id, 'close-now');
      expect(await current()).toEqual({ open: null, openWindows: [], upcoming: null });

      const cancelled = await createOk([item(cake)], { opensAt: iso(5), closesAt: iso(6) });
      await actionOk(cancelled.id, 'publish');
      await actionOk(cancelled.id, 'cancel');
      expect(await current()).toEqual({ open: null, openWindows: [], upcoming: null });
    });

    it('prekės turi produkto aprašymą ir alergenus (atidarytame ir būsimame lange)', async () => {
      const tart = await createProduct(ctx, {
        name: 'Migdolų pyragas',
        description: 'Su migdolų kremu.',
        allergens: ['kiaušiniai', 'migdolai', 'pienas'],
      });
      const open = await createOk([item(tart), item(cake)]);
      await actionOk(open.id, 'open-now');
      const upcoming = await createOk([item(tart)], { opensAt: iso(5), closesAt: iso(6) });
      await actionOk(upcoming.id, 'publish');

      const res = await current();
      expect(res.open!.items).toEqual([
        expect.objectContaining({
          productName: 'Migdolų pyragas',
          description: 'Su migdolų kremu.',
          allergens: ['kiaušiniai', 'migdolai', 'pienas'],
        }),
        expect.objectContaining({ productName: 'Medaus tortas', description: '', allergens: [] }),
      ]);
      expect(res.upcoming!.items[0]).toMatchObject({
        description: 'Su migdolų kremu.',
        allergens: ['kiaušiniai', 'migdolai', 'pienas'],
      });
    });

    it('keli atidaryti langai: openWindows visi, anksčiausiai atidarytas pirmas', async () => {
      const a = await createOk([item(cake)], { title: 'A' });
      const b = await createOk([item(cake)], { title: 'B' });
      await actionOk(a.id, 'open-now');
      await actionOk(b.id, 'open-now');

      const res = await current();
      expect(res.openWindows.map((w) => w.id)).toEqual([a.id, b.id]);
      expect(res.open).toMatchObject({ id: a.id });
    });
  });
});

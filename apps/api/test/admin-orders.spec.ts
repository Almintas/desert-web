import type {
  AdminOrderDto,
  AdminOrderListResponse,
  AdminSaleWindowDto,
  OrderStatus,
} from '@desert-web/shared';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  clearDatabase,
  createProduct,
  createTestContext,
  item,
  loginAdmin,
  orderBody,
  type ProductFixture,
  type TestContext,
  windowBody,
} from './helpers';

describe('Admin užsakymai (/admin/orders)', () => {
  let ctx: TestContext;
  let token: string;
  let adminId: string;
  let cake: ProductFixture;
  let macarons: ProductFixture;
  let saleWindow: AdminSaleWindowDto;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const list = (query: Record<string, string | string[]> = {}) =>
    auth(http().get('/admin/orders').query(query));
  const getOne = (id: string) => auth(http().get(`/admin/orders/${id}`));
  const setStatus = (id: string, status: string) =>
    auth(http().post(`/admin/orders/${id}/status`).send({ status }));
  const cancel = (id: string, body: object = {}) =>
    auth(http().post(`/admin/orders/${id}/cancel`).send(body));
  const getWindow = async (id = saleWindow.id) =>
    (await auth(http().get(`/admin/sale-windows/${id}`))).body as AdminSaleWindowDto;

  let customerSeq = 0;
  async function placeOrder(
    items: { variantId: Types.ObjectId; quantity: number }[],
    options: {
      windowId?: string;
      customer?: { name: string; email: string; phone: string };
    } = {},
  ): Promise<{ id: string; orderNumber: string }> {
    customerSeq += 1;
    const customer = options.customer ?? {
      name: `Pirkėjas ${customerSeq}`,
      email: `pirkejas${customerSeq}@example.com`,
      phone: `+3706${String(customerSeq).padStart(7, '0')}`,
    };
    const res = await http()
      .post('/orders')
      .send(orderBody(options.windowId ?? saleWindow.id, items, { customer }));
    expect(res.status).toBe(201);
    return { id: res.body.order.id, orderNumber: res.body.order.orderNumber };
  }

  async function openWindow(
    items = [item(cake, 0), item(macarons, 0)],
  ): Promise<AdminSaleWindowDto> {
    const created = await auth(http().post('/admin/sale-windows').send(windowBody(items)));
    expect(created.status).toBe(201);
    const opened = await auth(http().post(`/admin/sale-windows/${created.body.id}/open-now`));
    expect(opened.status).toBe(200);
    return opened.body as AdminSaleWindowDto;
  }

  /** available === total - neatšaukti užsakyti kiekiai, 0 <= available <= total. */
  async function expectStockConsistent(windowId = saleWindow.id) {
    const w = await ctx.saleWindowModel.findById(windowId).lean().exec();
    const orders = await ctx.orderModel
      .find({ saleWindowId: new Types.ObjectId(windowId), status: { $ne: 'cancelled' } })
      .lean()
      .exec();
    for (const i of w!.items) {
      const ordered = orders
        .flatMap((o) => o.items)
        .filter((oi) => oi.variantId.equals(i.variantId))
        .reduce((sum, oi) => sum + oi.quantity, 0);
      expect(i.quantityAvailable).toBe(i.quantityTotal - ordered);
      expect(i.quantityAvailable).toBeGreaterThanOrEqual(0);
      expect(i.quantityAvailable).toBeLessThanOrEqual(i.quantityTotal);
    }
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
    adminId = (await auth(http().get('/admin/auth/me'))).body.id;
    cake = await createProduct(ctx, { name: 'Medaus tortas' });
    macarons = await createProduct(ctx, { name: 'Makaronai' });
    saleWindow = await openWindow();
  });

  describe('autentifikacija', () => {
    const id = new Types.ObjectId().toString();
    it.each([
      ['get', '/admin/orders'],
      ['get', `/admin/orders/${id}`],
      ['post', `/admin/orders/${id}/status`],
      ['post', `/admin/orders/${id}/cancel`],
    ] as const)('%s %s be tokeno: 401', async (method, path) => {
      expect((await http()[method](path).send({})).status).toBe(401);
    });
  });

  describe('GET /admin/orders/:id', () => {
    it('pilnas DTO su lango pavadinimu ir pradiniu „pending“ istorijos įrašu', async () => {
      const { id, orderNumber } = await placeOrder([
        { variantId: cake.variantIds[0]!, quantity: 2 },
      ]);
      const res = await getOne(id);
      expect(res.status).toBe(200);
      const dto = res.body as AdminOrderDto;
      expect(dto).toMatchObject({
        id,
        orderNumber,
        status: 'pending',
        totalCents: 4000,
        saleWindow: { id: saleWindow.id, title: saleWindow.title },
        cancellation: null,
      });
      expect(dto.customer.email).toMatch(/@example\.com$/);
      expect(dto.statusHistory).toEqual([
        { status: 'pending', at: expect.any(String), adminId: null },
      ]);
      expect(
        Math.abs(Date.parse(dto.statusHistory[0]!.at) - Date.parse(dto.createdAt)),
      ).toBeLessThan(5000);
    });

    it('senas užsakymas be statusHistory įkeliamas ir rodomas', async () => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
      await ctx.orderModel.collection.updateOne(
        { _id: new Types.ObjectId(id) },
        { $unset: { statusHistory: '' } },
      );
      const before = (await getOne(id)).body as AdminOrderDto;
      expect(before.statusHistory).toEqual([
        { status: 'pending', at: before.createdAt, adminId: null },
      ]);

      // Pirmas admino pakeitimas: sukūrimo įrašas vis tiek rodomas pirmas.
      const after = (await setStatus(id, 'confirmed')).body as AdminOrderDto;
      expect(after.statusHistory.map((h) => h.status)).toEqual(['pending', 'confirmed']);
      expect((await list()).status).toBe(200);
    });

    it('nežinomas ar netinkamas id: 404 ORDER_NOT_FOUND', async () => {
      const res = await getOne(new Types.ObjectId().toString());
      expect([res.status, res.body.code]).toEqual([404, 'ORDER_NOT_FOUND']);
      expect((await getOne('ne-id')).status).toBe(404);
      expect((await setStatus('ne-id', 'confirmed')).status).toBe(404);
      expect((await cancel(new Types.ObjectId().toString())).status).toBe(404);
    });
  });

  describe('GET /admin/orders (sąrašas)', () => {
    it('naujausi pirmi, su lango pavadinimu, kiekiu ir puslapiavimu', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const quantity = i === 4 ? 5 : 1; // iš viso 9 iš 10
        ids.push((await placeOrder([{ variantId: cake.variantIds[0]!, quantity }])).id);
      }
      const page1 = (await list({ pageSize: '2' })).body as AdminOrderListResponse;
      expect(page1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
      expect(page1.items.map((o) => o.id)).toEqual([ids[4], ids[3]]);
      expect(page1.items[0]).toMatchObject({
        itemCount: 5,
        totalCents: 10000,
        fulfillmentMethod: 'pickup',
        status: 'pending',
        saleWindow: { id: saleWindow.id, title: saleWindow.title },
      });
      expect(Object.keys(page1.items[0]!.customer).sort()).toEqual(['name', 'phone']);

      const page3 = (await list({ pageSize: '2', page: '3' })).body as AdminOrderListResponse;
      expect(page3.items.map((o) => o.id)).toEqual([ids[0]]);
    });

    it('filtrai: langas, viena ar kelios būsenos; counts be būsenos filtro', async () => {
      const a = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
      const b = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
      const c = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
      await setStatus(a.id, 'confirmed');
      await cancel(b.id);
      // Kitas langas (pirmą uždarom, kad nesikirstų).
      await auth(http().post(`/admin/sale-windows/${saleWindow.id}/close-now`)).expect(200);
      const other = await openWindow([item(cake, 0)]);
      const d = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }], {
        windowId: other.id,
      });

      const byWindow = (await list({ saleWindowId: saleWindow.id })).body as AdminOrderListResponse;
      expect(byWindow.items.map((o) => o.id).sort()).toEqual([a.id, b.id, c.id].sort());
      expect(byWindow.counts).toEqual({
        all: 3,
        pending: 1,
        confirmed: 1,
        ready: 0,
        completed: 0,
        cancelled: 1,
      });

      const pending = (await list({ saleWindowId: saleWindow.id, status: 'pending' }))
        .body as AdminOrderListResponse;
      expect(pending.items.map((o) => o.id)).toEqual([c.id]);
      expect(pending.total).toBe(1);
      expect(pending.counts.all).toBe(3); // skirtukų skaičiai nepriklauso nuo būsenos filtro

      const several = (await list({ status: 'pending,cancelled' })).body as AdminOrderListResponse;
      expect(several.items.map((o) => o.id).sort()).toEqual([b.id, c.id, d.id].sort());
      const repeated = (await list({ status: ['confirmed', 'cancelled'] }))
        .body as AdminOrderListResponse;
      expect(repeated.items.map((o) => o.id).sort()).toEqual([a.id, b.id].sort());

      expect((await list({ status: 'nezinoma' })).status).toBe(400);
      expect((await list({ saleWindowId: 'blogas' })).status).toBe(400);
    });

    it('paieška: numeris, vardas, el. paštas ir telefonas (normalizuoti)', async () => {
      const ona = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }], {
        customer: { name: 'Ona Žemaitytė', email: 'Ona.Z@Example.com', phone: '8 612 34567' },
      });
      await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }], {
        customer: { name: 'Petras', email: 'petras@example.com', phone: '+370 699 99999' },
      });
      const search = async (q: string) =>
        ((await list({ q })).body as AdminOrderListResponse).items.map((o) => o.id);

      expect(await search(ona.orderNumber)).toEqual([ona.id]);
      expect(await search(ona.orderNumber.toLowerCase())).toEqual([ona.id]);
      expect(await search('žemaityt')).toEqual([ona.id]);
      expect(await search('ONA.Z@EXAMPLE.COM')).toEqual([ona.id]);
      expect(await search('+370 612 34567')).toEqual([ona.id]);
      expect(await search('861234567')).toEqual([ona.id]);
      expect(await search('612 345')).toEqual([ona.id]);
      expect(await search('nieko')).toEqual([]);
      expect(await search('(.*')).toEqual([]); // regex simboliai ekranuojami
    });
  });

  describe('POST /admin/orders/:id/status', () => {
    const ALLOWED: [OrderStatus[], OrderStatus][] = [
      [[], 'confirmed'],
      [[], 'ready'],
      [[], 'completed'],
      [['confirmed'], 'ready'],
      [['confirmed'], 'completed'],
      [['ready'], 'completed'],
      [['confirmed', 'ready'], 'completed'],
    ];
    it.each(ALLOWED)('pending -> %j -> %s: leidžiama, istorijoje adminId', async (path, to) => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
      for (const s of path) expect((await setStatus(id, s)).status).toBe(200);
      const res = await setStatus(id, to);
      expect(res.status).toBe(200);
      const dto = res.body as AdminOrderDto;
      expect(dto.status).toBe(to);
      expect(dto.statusHistory.map((h) => h.status)).toEqual(['pending', ...path, to]);
      expect(dto.statusHistory.at(-1)!.adminId).toBe(adminId);
      // Būsenos keitimas kiekių nekeičia.
      await expectStockConsistent();
    });

    const REFUSED: [OrderStatus[], OrderStatus, RegExp][] = [
      [[], 'pending', /jau yra šios būsenos/],
      [['confirmed'], 'pending', /tik pirmyn/],
      [['confirmed'], 'confirmed', /jau yra šios būsenos/],
      [['ready'], 'confirmed', /tik pirmyn/],
      [['completed'], 'ready', /jau įvykdytas/],
      [['completed'], 'completed', /jau įvykdytas/],
      [[], 'cancelled', /tik veiksmu „Atšaukti užsakymą“/],
    ];
    it.each(REFUSED)('po %j -> %s: 409 INVALID_STATUS_TRANSITION', async (path, to, message) => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
      for (const s of path) expect((await setStatus(id, s)).status).toBe(200);
      const res = await setStatus(id, to);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
      expect(res.body.message).toMatch(message);
      expect((await getOne(id)).body.statusHistory).toHaveLength(path.length + 1);
    });

    it('iš atšaukto: 409', async () => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
      await cancel(id).expect(200);
      for (const s of ['confirmed', 'ready', 'completed', 'pending']) {
        const res = await setStatus(id, s);
        expect([res.status, res.body.code]).toEqual([409, 'INVALID_STATUS_TRANSITION']);
        expect(res.body.message).toMatch(/jau atšauktas/);
      }
    });

    it('netinkama būsena: 400', async () => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
      expect((await setStatus(id, 'shipped')).status).toBe(400);
    });
  });

  describe('POST /admin/orders/:id/cancel', () => {
    it.each<{ path: OrderStatus[] }>([
      { path: [] },
      { path: ['confirmed'] },
      { path: ['ready'] },
      { path: ['confirmed', 'ready'] },
    ])('pending -> $path -> atšaukta: grąžina kiekius į langą', async ({ path }) => {
      const { id } = await placeOrder([
        { variantId: cake.variantIds[0]!, quantity: 3 },
        { variantId: macarons.variantIds[0]!, quantity: 2 },
      ]);
      for (const s of path) await setStatus(id, s).expect(200);
      let w = await getWindow();
      expect(w.items.map((i) => i.quantityAvailable)).toEqual([7, 8]);
      expect(w.ordersCount).toBe(1);

      const res = await cancel(id, { reason: '  Pirkėjas paprašė  ' });
      expect(res.status).toBe(200);
      const dto = res.body as AdminOrderDto;
      expect(dto.status).toBe('cancelled');
      expect(dto.cancellation).toEqual({
        reason: 'Pirkėjas paprašė',
        cancelledAt: dto.statusHistory.at(-1)!.at,
        cancelledBy: adminId,
      });
      expect(dto.statusHistory.map((h) => h.status)).toEqual(['pending', ...path, 'cancelled']);

      w = await getWindow();
      expect(w.items.map((i) => [i.quantityAvailable, i.sold, i.ordersCount])).toEqual([
        [10, 0, 0],
        [10, 0, 0],
      ]);
      expect(w.ordersCount).toBe(0);
      await expectStockConsistent();
    });

    it('be priežasties: cancellation.reason null', async () => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
      const res = await cancel(id, { reason: '   ' });
      expect(res.body.cancellation.reason).toBeNull();
    });

    it('įvykdyto: 409, kiekiai negrąžinami', async () => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 2 }]);
      await setStatus(id, 'completed').expect(200);
      const res = await cancel(id);
      expect([res.status, res.body.code]).toEqual([409, 'INVALID_STATUS_TRANSITION']);
      expect((await getWindow()).items[0]!.quantityAvailable).toBe(8);
    });

    it('pakartotinis atšaukimas (iš eilės): 409, kiekiai grąžinami tik kartą', async () => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 4 }]);
      await cancel(id).expect(200);
      const again = await cancel(id);
      expect([again.status, again.body.code]).toEqual([409, 'INVALID_STATUS_TRANSITION']);
      expect(again.body.message).toMatch(/jau atšauktas/);
      expect((await getWindow()).items[0]!.quantityAvailable).toBe(10);
      expect((await getOne(id)).body.statusHistory).toHaveLength(2);
    });

    it('lygiagretūs atšaukimai: vienas 200, kiti 409, kiekiai grąžinami tik kartą', async () => {
      for (let round = 0; round < 5; round++) {
        const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 1 }]);
        const responses = await Promise.all(Array.from({ length: 5 }, () => cancel(id)));
        expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
        await expectStockConsistent();
      }
      expect((await getWindow()).items[0]!.quantityAvailable).toBe(10);
    });

    it('uždarytame lange kiekiai vis tiek grąžinami', async () => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 2 }]);
      await auth(http().post(`/admin/sale-windows/${saleWindow.id}/close-now`)).expect(200);
      await cancel(id).expect(200);
      const w = await getWindow();
      expect(w.phase).toBe('closed');
      expect(w.items[0]!.quantityAvailable).toBe(10);
    });

    it('atšaukus užsakymą, prekę galima išimti iš lango ir langą atšaukti', async () => {
      const { id } = await placeOrder([{ variantId: cake.variantIds[0]!, quantity: 2 }]);
      const blocked = await auth(http().post(`/admin/sale-windows/${saleWindow.id}/cancel`));
      expect(blocked.body.code).toBe('WINDOW_HAS_ORDERS');
      await cancel(id).expect(200);
      await auth(http().post(`/admin/sale-windows/${saleWindow.id}/cancel`)).expect(200);
    });

    it('atšaukimas atlaisvina limitą vienam pirkėjui (maxPerCustomer)', async () => {
      await auth(http().post(`/admin/sale-windows/${saleWindow.id}/close-now`)).expect(200);
      const limited = await openWindow([item(cake, 0, { maxPerCustomer: 2 })]);
      const customer = { name: 'Ona', email: 'ona@example.com', phone: '+37061234567' };
      const variantId = cake.variantIds[0]!;
      const first = await placeOrder([{ variantId, quantity: 2 }], {
        windowId: limited.id,
        customer,
      });

      const refused = await http()
        .post('/orders')
        .send(orderBody(limited.id, [{ variantId, quantity: 1 }], { customer }));
      expect(refused.body.code).toBe('MAX_PER_CUSTOMER_EXCEEDED');

      await cancel(first.id).expect(200);
      const again = await http()
        .post('/orders')
        .send(orderBody(limited.id, [{ variantId, quantity: 2 }], { customer }));
      expect(again.status).toBe(201);
      await expectStockConsistent(limited.id);
    });
  });
});

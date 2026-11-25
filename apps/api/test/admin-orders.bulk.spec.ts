import './env/emails';
import type { AdminOrderBulkStatusResponse, AdminSaleWindowDto } from '@desert-web/shared';
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

describe('Masinis būsenos keitimas (POST /admin/orders/bulk-status)', () => {
  let ctx: TestContext;
  let token: string;
  let cake: ProductFixture;
  let saleWindow: AdminSaleWindowDto;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test, t = token) => req.set('Authorization', `Bearer ${t}`);
  const bulk = (body: object, t = token) =>
    auth(http().post('/admin/orders/bulk-status').send(body), t);
  const setStatus = (id: string, status: string) =>
    auth(http().post(`/admin/orders/${id}/status`).send({ status }));
  /** Laiškai pirkėjams apie būseną (idempotencyKey: order-status/<id>/<status>). */
  const statusEmails = async () => {
    await ctx.notifications.whenIdle();
    return ctx.emails.sent
      .map((m) => m.idempotencyKey)
      .filter((k) => k.startsWith('order-status/'))
      .sort();
  };

  async function placeOrder(): Promise<string> {
    const res = await http()
      .post('/orders')
      .send(orderBody(saleWindow.id, [{ variantId: cake.variantIds[0]!, quantity: 1 }]));
    expect(res.status).toBe(201);
    return res.body.order.id as string;
  }

  async function statusOf(id: string) {
    const o = await ctx.orderModel.findById(id).lean().exec();
    return { status: o!.status, history: (o!.statusHistory ?? []).map((h) => h.status) };
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
    cake = await createProduct(ctx);
    const created = await auth(
      http()
        .post('/admin/sale-windows')
        .send(windowBody([item(cake, 0, { quantityTotal: 200 })])),
    );
    const opened = await auth(http().post(`/admin/sale-windows/${created.body.id}/open-now`));
    expect(opened.status).toBe(200);
    saleWindow = opened.body as AdminSaleWindowDto;
  });

  it('mišrūs užsakymai: kiekvienas atskirai, ne „viskas arba nieko“; laiškai tik pakeistiems', async () => {
    const pending1 = await placeOrder();
    const pending2 = await placeOrder();
    const confirmed = await placeOrder();
    const ready = await placeOrder();
    const completed = await placeOrder();
    const cancelled = await placeOrder();
    expect((await setStatus(confirmed, 'confirmed')).status).toBe(200);
    expect((await setStatus(ready, 'ready')).status).toBe(200);
    expect((await setStatus(completed, 'completed')).status).toBe(200);
    expect((await auth(http().post(`/admin/orders/${cancelled}/cancel`).send({}))).status).toBe(
      200,
    );
    await ctx.notifications.whenIdle();
    ctx.emails.clear();
    const missing = new Types.ObjectId().toString();

    const ids = [pending1, confirmed, completed, missing, ready, cancelled, pending2];
    const res = await bulk({ ids, status: 'confirmed' });
    expect(res.status).toBe(200);
    const body = res.body as AdminOrderBulkStatusResponse;

    expect(body.results.map((r) => [r.id, r.outcome])).toEqual([
      [pending1, 'updated'],
      [confirmed, 'unchanged'],
      [completed, 'error'],
      [missing, 'error'],
      [ready, 'error'],
      [cancelled, 'error'],
      [pending2, 'updated'],
    ]);
    expect(body.summary).toEqual({ updated: 2, unchanged: 1, failed: 4 });
    expect(body.results[0]).toMatchObject({ status: 'confirmed', orderNumber: expect.any(String) });
    expect(body.results[2]).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      status: 'completed',
      orderNumber: expect.any(String),
      message: expect.stringContaining('įvykdytas'),
    });
    expect(body.results[3]).toMatchObject({
      code: 'ORDER_NOT_FOUND',
      orderNumber: null,
      status: null,
    });
    // Atgal (ready -> confirmed) negalima, kaip ir po vieną.
    expect(body.results[4]).toMatchObject({ code: 'INVALID_STATUS_TRANSITION', status: 'ready' });
    expect(body.results[5]).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      status: 'cancelled',
    });

    expect(await statusOf(pending1)).toEqual({
      status: 'confirmed',
      history: ['pending', 'confirmed'],
    });
    expect(await statusOf(pending2)).toEqual({
      status: 'confirmed',
      history: ['pending', 'confirmed'],
    });
    // Jau patvirtintas: istorijoje neatsiranda antro įrašo.
    expect(await statusOf(confirmed)).toEqual({
      status: 'confirmed',
      history: ['pending', 'confirmed'],
    });
    expect((await statusOf(completed)).status).toBe('completed');
    expect((await statusOf(ready)).status).toBe('ready');

    // Po vieną laišką kiekvienam pakeistam, jau patvirtintam ir nepavykusiems – nė vieno.
    expect(await statusEmails()).toEqual(
      [`order-status/${pending1}/confirmed`, `order-status/${pending2}/confirmed`].sort(),
    );
  });

  it('„Paruošta“: iš laukiančio ir patvirtinto; pakartojus viskas „unchanged“ ir laiškų nebėra', async () => {
    const pending = await placeOrder();
    const confirmed = await placeOrder();
    expect((await setStatus(confirmed, 'confirmed')).status).toBe(200);
    await ctx.notifications.whenIdle();
    ctx.emails.clear();

    const first = await bulk({ ids: [pending, confirmed], status: 'ready' });
    expect(first.status).toBe(200);
    expect(first.body.summary).toEqual({ updated: 2, unchanged: 0, failed: 0 });
    expect(await statusOf(pending)).toEqual({ status: 'ready', history: ['pending', 'ready'] });
    expect(await statusOf(confirmed)).toEqual({
      status: 'ready',
      history: ['pending', 'confirmed', 'ready'],
    });
    expect(await statusEmails()).toEqual(
      [`order-status/${pending}/ready`, `order-status/${confirmed}/ready`].sort(),
    );

    ctx.emails.clear();
    const again = await bulk({ ids: [pending, confirmed], status: 'ready' });
    expect(again.status).toBe(200);
    expect(again.body.summary).toEqual({ updated: 0, unchanged: 2, failed: 0 });
    expect(await statusEmails()).toEqual([]);
  });

  describe('validacija (400, niekas nekeičiama)', () => {
    it('pasikartojantys ID (ir skirtingo registro)', async () => {
      const id = await placeOrder();
      for (const ids of [
        [id, id],
        [id, id.toUpperCase()],
      ]) {
        const res = await bulk({ ids, status: 'confirmed' });
        expect(res.status).toBe(400);
        expect(res.body.issues[0]).toMatchObject({ path: 'ids', message: 'Užsakymai kartojasi' });
      }
      expect((await statusOf(id)).status).toBe('pending');
    });

    it('daugiau nei 100 ID: 400; lygiai 100: priimama', async () => {
      const ids = (n: number) => Array.from({ length: n }, () => new Types.ObjectId().toString());
      expect((await bulk({ ids: ids(101), status: 'confirmed' })).status).toBe(400);
      const ok = await bulk({ ids: ids(100), status: 'confirmed' });
      expect(ok.status).toBe(200);
      expect(ok.body.summary).toEqual({ updated: 0, unchanged: 0, failed: 100 });
    });

    it.each([
      [{ ids: [], status: 'confirmed' }],
      [{ status: 'confirmed' }],
      [{ ids: ['ne-id'], status: 'confirmed' }],
      [{ ids: 'abc', status: 'confirmed' }],
    ])('netinkami ID: %j', async (body) => {
      expect((await bulk(body)).status).toBe(400);
    });

    it.each(['cancelled', 'completed', 'pending', 'nera'])(
      'būsena „%s“ masiškai neleidžiama',
      async (status) => {
        const id = await placeOrder();
        const res = await bulk({ ids: [id], status });
        expect(res.status).toBe(400);
        expect((await statusOf(id)).status).toBe('pending');
      },
    );
  });

  describe('teisės (kaip POST /admin/orders/:id/status)', () => {
    it('be tokeno: 401', async () => {
      const id = await placeOrder();
      const res = await http()
        .post('/admin/orders/bulk-status')
        .send({ ids: [id], status: 'confirmed' });
      expect(res.status).toBe(401);
      expect((await statusOf(id)).status).toBe('pending');
    });

    it.each(['staff', 'owner'] as const)('%s gali keisti', async (role) => {
      const id = await placeOrder();
      const t = await loginAdmin(ctx, role);
      const single = await placeOrder();
      expect(
        (await auth(http().post(`/admin/orders/${single}/status`), t).send({ status: 'confirmed' }))
          .status,
      ).toBe(200);
      const res = await bulk({ ids: [id], status: 'confirmed' }, t);
      expect(res.status).toBe(200);
      expect(res.body.summary.updated).toBe(1);
    });
  });
});

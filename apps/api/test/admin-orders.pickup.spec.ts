import type { AdminPickupOrderDto, AdminSaleWindowDto } from '@desert-web/shared';
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

describe('Atsiėmimo sąrašas (GET /admin/orders/pickup-list)', () => {
  let ctx: TestContext;
  let token: string;
  let cake: ProductFixture;
  let macarons: ProductFixture;
  let saleWindow: AdminSaleWindowDto;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test, t = token) => req.set('Authorization', `Bearer ${t}`);
  const pickupList = (saleWindowId: string, t = token) =>
    auth(http().get('/admin/orders/pickup-list').query({ saleWindowId }), t);

  async function openWindow(): Promise<AdminSaleWindowDto> {
    const created = await auth(
      http()
        .post('/admin/sale-windows')
        .send(windowBody([item(cake, 0), item(macarons, 0)])),
    );
    expect(created.status).toBe(201);
    const opened = await auth(http().post(`/admin/sale-windows/${created.body.id}/open-now`));
    expect(opened.status).toBe(200);
    return opened.body as AdminSaleWindowDto;
  }

  let seq = 0;
  async function placeOrder(
    name: string,
    items: { variantId: Types.ObjectId; quantity: number; giftWrapQuantity?: number }[],
    windowId = saleWindow.id,
    notes?: string,
  ): Promise<string> {
    seq += 1;
    const res = await http()
      .post('/orders')
      .send(
        orderBody(windowId, items, {
          customer: {
            name,
            email: `pirkejas${seq}@example.com`,
            phone: `+3706${String(seq).padStart(7, '0')}`,
          },
          fulfillment: { method: 'pickup', ...(notes ? { notes } : {}) },
        }),
      );
    expect(res.status).toBe(201);
    return res.body.order.id as string;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    token = await loginAdmin(ctx, 'owner');
    cake = await createProduct(ctx, { name: 'Medaus tortas' });
    macarons = await createProduct(ctx, { name: 'Makaronai' });
    saleWindow = await openWindow();
  });

  it('be tokeno: 401', async () => {
    const res = await http()
      .get('/admin/orders/pickup-list')
      .query({ saleWindowId: saleWindow.id });
    expect(res.status).toBe(401);
  });

  it('netinkamas lango ID: 400; nesamas langas: 404', async () => {
    expect((await pickupList('ne-id')).status).toBe(400);
    expect((await auth(http().get('/admin/orders/pickup-list'))).status).toBe(400);
    const missing = await pickupList(new Types.ObjectId().toString());
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('SALE_WINDOW_NOT_FOUND');
  });

  it('neatšaukti lango užsakymai pagal vardą (lietuviška abėcėlė), su prekėmis ir apmokėjimu', async () => {
    const zigmas = await placeOrder('Žigmas', [{ variantId: cake.variantIds[0]!, quantity: 1 }]);
    const sarune = await placeOrder(
      'Šarūnė',
      [
        { variantId: cake.variantIds[0]!, quantity: 2, giftWrapQuantity: 0 },
        { variantId: macarons.variantIds[0]!, quantity: 1 },
      ],
      saleWindow.id,
      'Atvažiuosiu 15 val.',
    );
    const ona = await placeOrder('ona', [{ variantId: macarons.variantIds[0]!, quantity: 3 }]);
    const cancelled = await placeOrder('Antanas', [
      { variantId: cake.variantIds[0]!, quantity: 1 },
    ]);
    const otherWindow = await openWindow();
    await placeOrder('Kitas', [{ variantId: cake.variantIds[0]!, quantity: 1 }], otherWindow.id);

    expect((await auth(http().post(`/admin/orders/${cancelled}/cancel`).send({}))).status).toBe(
      200,
    );
    const done = await auth(
      http().post(`/admin/orders/${ona}/status`).send({ status: 'completed' }),
    );
    expect(done.status).toBe(200);

    const res = await pickupList(saleWindow.id);
    expect(res.status).toBe(200);
    const list = res.body as AdminPickupOrderDto[];
    // „ona“ (mažoji) prieš „Šarūnė“, „Š“ prieš „Ž“ (lietuviška tvarka, ne ASCII).
    expect(list.map((o) => o.id)).toEqual([ona, sarune, zigmas]);
    expect(list[0]).toMatchObject({ status: 'completed', paymentStatus: 'paid', notes: null });
    expect(list[1]).toMatchObject({
      customer: { name: 'Šarūnė' },
      status: 'pending',
      paymentStatus: 'unpaid',
      totalCents: 6000,
      notes: 'Atvažiuosiu 15 val.',
      items: [
        { productName: 'Medaus tortas', variantName: '1 kg', quantity: 2, giftWrapQuantity: 0 },
        { productName: 'Makaronai', variantName: '1 kg', quantity: 1, giftWrapQuantity: 0 },
      ],
    });
    // Tik atsiėmimui reikalingi laukai (be el. pašto).
    expect(Object.keys(list[1]!.customer).sort()).toEqual(['name', 'phone']);
  });

  it('staff taip pat gali matyti sąrašą', async () => {
    await placeOrder('Ona', [{ variantId: cake.variantIds[0]!, quantity: 1 }]);
    const staff = await loginAdmin(ctx, 'staff');
    const res = await pickupList(saleWindow.id, staff);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

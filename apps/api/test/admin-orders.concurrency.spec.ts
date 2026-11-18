import type { AdminSaleWindowDto } from '@desert-web/shared';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  bodyFrom,
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

describe('Admin užsakymų atšaukimas: lygiagretumas', () => {
  let ctx: TestContext;
  let token: string;
  let product: ProductFixture;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const order = (windowId: string, quantity = 1) =>
    http()
      .post('/orders')
      .send(orderBody(windowId, [{ variantId: product.variantIds[0]!, quantity }]));
  const cancel = (orderId: string) => auth(http().post(`/admin/orders/${orderId}/cancel`).send({}));

  async function openWindow(quantityTotal: number): Promise<AdminSaleWindowDto> {
    const created = await auth(
      http()
        .post('/admin/sale-windows')
        .send(windowBody([item(product, 0, { quantityTotal })])),
    );
    expect(created.status).toBe(201);
    const opened = await auth(http().post(`/admin/sale-windows/${created.body.id}/open-now`));
    expect(opened.status).toBe(200);
    return opened.body as AdminSaleWindowDto;
  }

  async function placeOrders(windowId: string, n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await order(windowId);
      expect(res.status).toBe(201);
      ids.push(res.body.order.id);
    }
    return ids;
  }

  /** Po kiekvienų lenktynių: available === total - neatšaukti kiekiai, 0..total. */
  async function expectStockConsistent(windowId: string) {
    const w = await ctx.saleWindowModel.findById(windowId).lean().exec();
    const item0 = w!.items[0]!;
    const ordered = (
      await ctx.orderModel
        .find({ saleWindowId: new Types.ObjectId(windowId), status: { $ne: 'cancelled' } })
        .lean()
        .exec()
    )
      .flatMap((o) => o.items)
      .reduce((sum, i) => sum + i.quantity, 0);
    expect(item0.quantityAvailable).toBe(item0.quantityTotal - ordered);
    expect(item0.quantityAvailable).toBeGreaterThanOrEqual(0);
    expect(item0.quantityAvailable).toBeLessThanOrEqual(item0.quantityTotal);
    return { item: item0, ordered };
  }

  async function reset() {
    await clearDatabase(ctx.connection);
    token = await loginAdmin(ctx);
    product = await createProduct(ctx);
  }

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(reset);

  it('atšaukimai lenktyniaujant su naujais užsakymais tai pačiai prekei', async () => {
    for (let round = 0; round < 5; round++) {
      if (round > 0) await reset();
      // Viskas išparduota: nauji užsakymai pavyksta tik iš atšauktų grąžintų kiekių.
      const w = await openWindow(5);
      const existing = await placeOrders(w.id, 5);

      const newOrders = Array.from({ length: 6 }, () => order(w.id));
      const cancels = existing.slice(0, 2).map((id) => cancel(id));
      const responses = await Promise.all([
        ...newOrders.slice(0, 3),
        ...cancels,
        ...newOrders.slice(3),
      ]);

      expect(responses.filter((r) => r.status >= 500)).toEqual([]);
      const cancelRes = responses.slice(3, 5);
      expect(cancelRes.map((r) => r.status)).toEqual([200, 200]);
      const orderRes = [...responses.slice(0, 3), ...responses.slice(5)];
      for (const r of orderRes) {
        if (r.status !== 201) expect([r.status, r.body.code]).toEqual([409, 'INSUFFICIENT_STOCK']);
      }
      const succeeded = orderRes.filter((r) => r.status === 201).length;
      expect(succeeded).toBeLessThanOrEqual(2);

      const { item: stored, ordered } = await expectStockConsistent(w.id);
      expect(ordered).toBe(3 + succeeded);
      expect(stored.quantityTotal).toBe(5);
    }
  });

  it('atšaukimas lenktyniaujant su lango PUT, mažinančiu kiekį iki parduoto', async () => {
    for (let round = 0; round < 5; round++) {
      if (round > 0) await reset();
      const w = await openWindow(10);
      const ids = await placeOrders(w.id, 4); // parduota 4
      const current = (await auth(http().get(`/admin/sale-windows/${w.id}`))).body;
      const body = bodyFrom(current);
      body.items[0]!.quantityTotal = 4; // lygiai parduota

      const [putRes, cancelRes] = await Promise.all([
        auth(http().put(`/admin/sale-windows/${w.id}`).send(body)),
        cancel(ids[0]!),
      ]);

      // Abi tvarkos teisingos: PUT pirmas (4 -> likutis 0, tada +1) arba atšaukimas pirmas
      // (parduota 3, PUT 4 >= 3 -> likutis 1). Bet kuriuo atveju likutis 1.
      expect([putRes.status, cancelRes.status]).toEqual([200, 200]);
      const { item: stored } = await expectStockConsistent(w.id);
      expect(stored).toMatchObject({ quantityTotal: 4, quantityAvailable: 1 });
    }
  });
});

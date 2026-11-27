import type { OrderAccessDto, OrderItemErrorBody } from '@desert-web/shared';
import request from 'supertest';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  getQuantityAvailable,
  orderBody,
  type TestContext,
} from './helpers';

/** Klaidų `details`, mokėjimas ir pirkėjo užsakymo vaizdas su lango pavadinimu. */
describe('Užsakymai: klaidų details, mokėjimas, prieigos vaizdas', () => {
  let ctx: TestContext;

  const post = (body: object) => request(ctx.app.getHttpServer()).post('/orders').send(body);

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
  });

  async function twoItemWindow(
    a: { quantity?: number; maxPerOrder?: number; maxPerCustomer?: number } = {},
    b: { quantity?: number; maxPerOrder?: number; maxPerCustomer?: number } = {},
  ) {
    const pa = await createProduct(ctx, { name: 'Makaronai' });
    const pb = await createProduct(ctx, { name: 'Pyragas' });
    const window = await createSaleWindow(ctx, {
      items: [
        { productId: pa.productId, variantId: pa.variantIds[0]!, ...a },
        { productId: pb.productId, variantId: pb.variantIds[0]!, ...b },
      ],
    });
    return { window, a: pa.variantIds[0]!, b: pb.variantIds[0]! };
  }

  it('INSUFFICIENT_STOCK: details.items su visomis trūkstamomis eilutėmis ir likučiu', async () => {
    const { window, a, b } = await twoItemWindow({ quantity: 2 }, { quantity: 0 });
    const res = await post(
      orderBody(window._id, [
        { variantId: a, quantity: 5 },
        { variantId: b, quantity: 1 },
      ]),
    );
    expect(res.status).toBe(409);
    const body = res.body as OrderItemErrorBody;
    expect(body.code).toBe('INSUFFICIENT_STOCK');
    expect(body.details.items).toEqual([
      { variantId: a.toString(), requested: 5, allowed: 2 },
      { variantId: b.toString(), requested: 1, allowed: 0 },
    ]);
  });

  it('MAX_PER_ORDER_EXCEEDED: details nurodo variantId ir leidžiamą kiekį', async () => {
    const { window, a, b } = await twoItemWindow({ maxPerOrder: 3 }, { maxPerOrder: 1 });
    const res = await post(
      orderBody(window._id, [
        { variantId: a, quantity: 4 },
        { variantId: b, quantity: 2 },
      ]),
    );
    expect(res.status).toBe(400);
    const body = res.body as OrderItemErrorBody;
    expect(body.code).toBe('MAX_PER_ORDER_EXCEEDED');
    expect(body.details.items).toEqual([
      { variantId: a.toString(), requested: 4, allowed: 3 },
      { variantId: b.toString(), requested: 2, allowed: 1 },
    ]);
  });

  it('MAX_PER_CUSTOMER_EXCEEDED: details.allowed yra likęs pirkėjo limitas', async () => {
    const { window, a } = await twoItemWindow({ quantity: 20, maxPerCustomer: 3 });
    const customer = { name: 'Ona', email: 'ona@example.com', phone: '+37061111111' };
    expect(
      (await post(orderBody(window._id, [{ variantId: a, quantity: 2 }], { customer }))).status,
    ).toBe(201);

    const res = await post(orderBody(window._id, [{ variantId: a, quantity: 2 }], { customer }));
    expect(res.status).toBe(409);
    const body = res.body as OrderItemErrorBody;
    expect(body.code).toBe('MAX_PER_CUSTOMER_EXCEEDED');
    expect(body.details.items).toEqual([{ variantId: a.toString(), requested: 2, allowed: 1 }]);
  });

  it('ITEM_UNAVAILABLE: produkto variantas pašalintas, details.allowed = 0', async () => {
    const p = await createProduct(ctx, {
      variants: [
        { name: '6 vnt.', priceCents: 900 },
        { name: '12 vnt.', priceCents: 1700 },
      ],
    });
    const window = await createSaleWindow(ctx, {
      items: [
        { productId: p.productId, variantId: p.variantIds[0]! },
        { productId: p.productId, variantId: p.variantIds[1]! },
      ],
    });
    await ctx.productModel.updateOne(
      { _id: p.productId },
      { $pull: { variants: { _id: p.variantIds[1] } } },
    );

    const res = await post(
      orderBody(window._id, [
        { variantId: p.variantIds[0]!, quantity: 1 },
        { variantId: p.variantIds[1]!, quantity: 2 },
      ]),
    );
    expect(res.status).toBe(400);
    const body = res.body as OrderItemErrorBody;
    expect(body.code).toBe('ITEM_UNAVAILABLE');
    expect(body.details.items).toEqual([
      { variantId: p.variantIds[1]!.toString(), requested: 2, allowed: 0 },
    ]);
    expect(await getQuantityAvailable(ctx, window._id, p.variantIds[0]!)).toBe(10);
  });

  it('ITEM_NOT_IN_WINDOW: details.allowed = 0', async () => {
    const { window } = await twoItemWindow();
    const other = await createProduct(ctx, { name: 'Kita' });
    const res = await post(
      orderBody(window._id, [{ variantId: other.variantIds[0]!, quantity: 1 }]),
    );
    expect(res.status).toBe(400);
    expect((res.body as OrderItemErrorBody).details.items).toEqual([
      { variantId: other.variantIds[0]!.toString(), requested: 1, allowed: 0 },
    ]);
  });

  it('naujas užsakymas: payment unpaid, on_pickup; prieigos vaizdas su lango pavadinimu', async () => {
    const p = await createProduct(ctx);
    const window = await createSaleWindow(ctx, {
      items: [{ productId: p.productId, variantId: p.variantIds[0]! }],
    });
    const res = await post(orderBody(window._id, [{ variantId: p.variantIds[0]!, quantity: 1 }]));
    expect(res.status).toBe(201);
    expect(res.body.order.payment).toEqual({ status: 'unpaid', method: 'on_pickup', paidAt: null });

    const stored = await ctx.orderModel.findById(res.body.order.id).lean().exec();
    expect(stored?.payment).toMatchObject({ status: 'unpaid', method: 'on_pickup' });

    const view = await request(ctx.app.getHttpServer()).get(
      `/orders/access/${res.body.accessToken}`,
    );
    expect(view.status).toBe(200);
    const dto = view.body as OrderAccessDto;
    expect(dto.saleWindow).toEqual({
      id: window._id.toString(),
      title: 'Savaitgalio pardavimas',
    });
    expect(dto.orderNumber).toBe(res.body.order.orderNumber);
  });
});

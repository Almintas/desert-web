import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  getQuantityAvailable,
  orderBody,
  type TestContext,
  uniqueCustomer,
} from './helpers';

describe('Užsakymai: idempotencija (clientRequestId)', () => {
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

  async function setup(quantity = 10) {
    const p = await createProduct(ctx);
    const variantId = p.variantIds[0]!;
    const window = await createSaleWindow(ctx, {
      items: [{ productId: p.productId, variantId, quantity }],
    });
    return { window, variantId };
  }

  it('clientRequestId privalomas ir turi būti UUID', async () => {
    const { window, variantId } = await setup();
    const { clientRequestId: _omit, ...withoutId } = orderBody(window._id, [
      { variantId, quantity: 1 },
    ]);
    const missing = await post(withoutId);
    expect(missing.status).toBe(400);
    expect(missing.body.issues.map((i: { path: string }) => i.path)).toContain('clientRequestId');

    const invalid = await post(
      orderBody(window._id, [{ variantId, quantity: 1 }], { clientRequestId: 'ne-uuid' }),
    );
    expect(invalid.status).toBe(400);
  });

  it('pakartojimas iš eilės: 200 su tuo pačiu užsakymu ir accessToken, kiekis rezervuojamas kartą', async () => {
    const { window, variantId } = await setup();
    const body = orderBody(window._id, [{ variantId, quantity: 3 }]);

    const first = await post(body);
    expect(first.status).toBe(201);
    const second = await post(body);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);

    expect(await ctx.orderModel.countDocuments()).toBe(1);
    expect(await getQuantityAvailable(ctx, window._id, variantId)).toBe(7);
    const stored = await ctx.orderModel.findById(first.body.order.id).lean().exec();
    expect(stored?.clientRequestId).toBe(body.clientRequestId);
  });

  it('pakartojimas grąžina užsakymą net jei langas jau uždarytas ar prekės išparduotos', async () => {
    const { window, variantId } = await setup(2);
    const body = orderBody(window._id, [{ variantId, quantity: 2 }]);
    const first = await post(body);
    expect(first.status).toBe(201);

    await ctx.saleWindowModel.updateOne(
      { _id: window._id },
      { closesAt: new Date(Date.now() - 1000) },
    );
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(again.body.order.id).toBe(first.body.order.id);
  });

  it('nesėkmingas bandymas ID neužima: tas pats ID po kiekio pataisymo sukuria užsakymą', async () => {
    const { window, variantId } = await setup(2);
    const clientRequestId = randomUUID();
    const customer = uniqueCustomer();
    const tooMany = await post(
      orderBody(window._id, [{ variantId, quantity: 5 }], { clientRequestId, customer }),
    );
    expect(tooMany.status).toBe(409);
    const fixed = await post(
      orderBody(window._id, [{ variantId, quantity: 2 }], { clientRequestId, customer }),
    );
    expect(fixed.status).toBe(201);
  });

  it('tas pats ID kitam pirkėjui: 409 IDEMPOTENCY_CONFLICT, užsakymas neatiduodamas', async () => {
    const { window, variantId } = await setup();
    const clientRequestId = randomUUID();
    const first = await post(
      orderBody(window._id, [{ variantId, quantity: 1 }], { clientRequestId }),
    );
    expect(first.status).toBe(201);

    const other = await post(
      orderBody(window._id, [{ variantId, quantity: 1 }], { clientRequestId }),
    );
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(other.body.accessToken).toBeUndefined();
    expect(await ctx.orderModel.countDocuments()).toBe(1);
    expect(await getQuantityAvailable(ctx, window._id, variantId)).toBe(9);
  });

  it('5 lygiagrečios identiškos užklausos: 1 užsakymas, kiekis sumažintas kartą, visi gauna tą patį', async () => {
    for (let round = 0; round < 5; round++) {
      await clearDatabase(ctx.connection);
      const { window, variantId } = await setup();
      const body = orderBody(window._id, [{ variantId, quantity: 2 }]);

      const responses = await Promise.all(Array.from({ length: 5 }, () => post(body)));

      expect(responses.filter((r) => r.status >= 400).map((r) => r.body)).toEqual([]);
      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 200)).toHaveLength(4);
      const ids = new Set(responses.map((r) => r.body.order.id as string));
      const tokens = new Set(responses.map((r) => r.body.accessToken as string));
      expect(ids.size).toBe(1);
      expect(tokens.size).toBe(1);

      expect(await ctx.orderModel.countDocuments()).toBe(1);
      expect(await getQuantityAvailable(ctx, window._id, variantId)).toBe(8);
    }
  });

  it('unikalus indeksas: antras užsakymas su tuo pačiu clientRequestId DB lygiu negalimas', async () => {
    const indexes = await ctx.orderModel.collection.indexes();
    const index = indexes.find((i) => i.key.clientRequestId === 1);
    expect(index?.unique).toBe(true);
    expect(index?.partialFilterExpression).toEqual({ clientRequestId: { $type: 'string' } });
  });
});

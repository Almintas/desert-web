import './env/rate-limits';
import request from 'supertest';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  orderBody,
  setSpecialOrderSettings,
  specialOrderBody,
  type TestContext,
} from './helpers';

/**
 * Ribos iš env/rate-limits.ts (tos pačios kaip POST /orders ir GET /orders/access): POST 3 per
 * 2 s ir 5 per parą, GET access 4 per minutę. Skaitikliai atskiri nuo užsakymų.
 */
describe('Specialių užsakymų ribojimas pagal IP', () => {
  let ctx: TestContext;
  let ipSeq = 0;
  let ip: string;
  const SECRET = process.env.INTERNAL_API_SECRET!;

  const http = () => request(ctx.app.getHttpServer());
  const post = (body: object, from = ip) =>
    http().post('/special-orders').set('X-Forwarded-For', from).send(body);
  const access = (token: string, from = ip) =>
    http().get(`/special-orders/access/${token}`).set('X-Forwarded-For', from);

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    await setSpecialOrderSettings(ctx);
    ipSeq += 1;
    ip = `10.40.0.${ipSeq}`;
  });

  async function validBody() {
    const p = await createProduct(ctx, { specialOrder: { enabled: true, minQuantity: 1 } });
    return () => specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 5 }]);
  }

  function expectTooMany(res: request.Response) {
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  }

  it('POST: skaičiuojamas kiekvienas bandymas (ir nesėkmingas), ketvirtas 429', async () => {
    const body = await validBody();
    expect((await post(body())).status).toBe(201);
    expect((await post({ netinkamas: true })).status).toBe(400);
    expect((await post({ ...body(), turnstileToken: undefined })).status).toBe(403);
    expectTooMany(await post(body()));
    expect((await post(body(), '10.41.0.1')).status).toBe(201);
  });

  it('POST per web serverį: ribojama pagal pirkėjo IP (X-Client-IP), ne serverio', async () => {
    const body = await validBody();
    const viaWeb = (clientIp: string) =>
      post(body(), '10.42.0.1').set('X-Internal-Secret', SECRET).set('X-Client-IP', clientIp);
    for (let i = 0; i < 3; i++) expect((await viaWeb('203.0.113.30')).status).toBe(201);
    expectTooMany(await viaWeb('203.0.113.30'));
    expect((await viaWeb('203.0.113.31')).status).toBe(201);
  });

  it('specialių užsakymų ir užsakymų skaitikliai atskiri', async () => {
    const body = await validBody();
    for (let i = 0; i < 3; i++) expect((await post(body())).status).toBe(201);
    expectTooMany(await post(body()));

    const p = await createProduct(ctx);
    const window = await createSaleWindow(ctx, {
      items: [{ productId: p.productId, variantId: p.variantIds[0]!, quantity: 10 }],
    });
    const order = await http()
      .post('/orders')
      .set('X-Forwarded-For', ip)
      .send(orderBody(window._id, [{ variantId: p.variantIds[0]!, quantity: 1 }]));
    expect(order.status).toBe(201);
  });

  it('GET access: penktas bandymas per minutę 429 (skaičiuojami ir 404)', async () => {
    const token = 'B'.repeat(32);
    for (let i = 0; i < 4; i++) expect((await access(token)).status).toBe(404);
    expectTooMany(await access(token));
    expect((await access(token, '10.43.0.1')).status).toBe(404);
  });

  it('GET config neribojamas', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await http().get('/special-orders/config').set('X-Forwarded-For', ip)).status).toBe(
        200,
      );
    }
  });
});

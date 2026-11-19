import './env/rate-limits';
import { setTimeout as sleep } from 'node:timers/promises';
import request from 'supertest';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  orderBody,
  type TestContext,
} from './helpers';

/**
 * Ribos iš env/rate-limits.ts: POST /orders 3 per 2 s ir 5 per parą, GET /orders/access 4 per
 * minutę (produkcijoje 5 / 10 min., 20 / parą ir 60 / min., žr. env.spec.ts).
 */
describe('Užsakymų ribojimas pagal IP', () => {
  let ctx: TestContext;
  let ipSeq = 0;
  let ip: string;
  const SECRET = process.env.INTERNAL_API_SECRET!;

  const http = () => request(ctx.app.getHttpServer());
  const postOrder = (body: object, from = ip) =>
    http().post('/orders').set('X-Forwarded-For', from).send(body);
  const access = (token: string, from = ip) =>
    http().get(`/orders/access/${token}`).set('X-Forwarded-For', from);

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    ipSeq += 1;
    ip = `10.20.0.${ipSeq}`;
  });

  async function validBody() {
    const p = await createProduct(ctx);
    const variantId = p.variantIds[0]!;
    const window = await createSaleWindow(ctx, {
      items: [{ productId: p.productId, variantId, quantity: 100 }],
    });
    return () => orderBody(window._id, [{ variantId, quantity: 1 }]);
  }

  function expectTooMany(res: request.Response, maxSeconds: number) {
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: 'Per daug bandymų. Pabandykite po kelių minučių.',
    });
    const retryAfter = Number(res.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(maxSeconds);
    return retryAfter;
  }

  describe('POST /orders', () => {
    it('skaičiuojamas kiekvienas bandymas (ir nesėkmingas): ketvirtas per langą 429 su Retry-After', async () => {
      const body = await validBody();
      expect((await postOrder(body())).status).toBe(201);
      expect((await postOrder({ netinkamas: true })).status).toBe(400);
      expect((await postOrder({ ...body(), turnstileToken: undefined })).status).toBe(403);

      const blocked = await postOrder(body());
      expectTooMany(blocked, 2);
      expect(await ctx.orderModel.countDocuments()).toBe(1);

      // Kitas IP neužblokuotas.
      expect((await postOrder(body(), '10.21.0.1')).status).toBe(201);
    });

    it('trumpas langas praėjęs: vėl leidžiama, kol pasiekiama paros riba (5), tada 429 ilgam', async () => {
      const body = await validBody();
      for (let i = 0; i < 3; i++) expect((await postOrder(body())).status).toBe(201);
      expectTooMany(await postOrder(body()), 2);

      await sleep(2_100);
      // Trumpas langas atsinaujino. Paros skaitiklis 3: trumpo ribotuvo atmesta (429) užklausa
      // iki paros ribotuvo nebeateina, todėl leidžiami dar 2, o trečia viršija paros ribą.
      const statuses = [];
      for (let i = 0; i < 3; i++) statuses.push((await postOrder(body())).status);
      expect(statuses).toEqual([201, 201, 429]);

      await sleep(2_100);
      const daily = await postOrder(body());
      const retryAfter = expectTooMany(daily, 86_400);
      expect(retryAfter).toBeGreaterThan(60);
    });

    it('per web serverį (paslaptis + X-Client-IP) ribojama pagal pirkėjo IP, ne serverio', async () => {
      const body = await validBody();
      const viaWeb = (clientIp: string) =>
        postOrder(body(), '10.30.0.1')
          .set('X-Internal-Secret', SECRET)
          .set('X-Client-IP', clientIp);
      for (let i = 0; i < 3; i++) expect((await viaWeb('203.0.113.10')).status).toBe(201);
      expectTooMany(await viaWeb('203.0.113.10'), 2);
      expect((await viaWeb('203.0.113.11')).status).toBe(201);
    });
  });

  describe('GET /orders/access/:token', () => {
    it('penktas bandymas per minutę: 429 su Retry-After (skaičiuojami ir 404)', async () => {
      const token = 'A'.repeat(32);
      for (let i = 0; i < 4; i++) expect((await access(token)).status).toBe(404);
      expectTooMany(await access(token), 60);
      expect((await access(token, '10.22.0.1')).status).toBe(404);
    });

    it('užsakymo kūrimo ir peržiūros ribos atskiros', async () => {
      const body = await validBody();
      const created = await postOrder(body());
      expect(created.status).toBe(201);
      for (let i = 0; i < 4; i++) {
        expect((await access(created.body.accessToken)).status).toBe(200);
      }
      expectTooMany(await access(created.body.accessToken), 60);
      expect((await postOrder(body())).status).toBe(201);
    });
  });
});

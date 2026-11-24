import './env/production';
import request from 'supertest';
import {
  clearDatabase,
  createProduct,
  createTestContext,
  setSpecialOrderSettings,
  specialOrderBody,
  type TestContext,
} from './helpers';

/** API su NODE_ENV=production (žr. env/production.ts). */
describe('Produkcija: POST /special-orders tik iš web serverio (INTERNAL_API_SECRET)', () => {
  let ctx: TestContext;
  const SECRET = process.env.INTERNAL_API_SECRET!;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    await setSpecialOrderSettings(ctx);
  });

  async function body() {
    const p = await createProduct(ctx, { specialOrder: { enabled: true, minQuantity: 1 } });
    return specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 3 }]);
  }

  it('be paslapties: 403 FORBIDDEN_CLIENT, užklausa nesukuriama', async () => {
    const res = await http()
      .post('/special-orders')
      .send(await body());
    expect([res.status, res.body.code]).toEqual([403, 'FORBIDDEN_CLIENT']);
    expect(await ctx.connection.db!.collection('specialOrders').countDocuments()).toBe(0);
  });

  it('su neteisinga paslaptimi: 403 FORBIDDEN_CLIENT', async () => {
    const res = await http()
      .post('/special-orders')
      .set('X-Internal-Secret', `${SECRET.slice(0, -1)}x`)
      .set('X-Client-IP', '203.0.113.9')
      .send(await body());
    expect([res.status, res.body.code]).toEqual([403, 'FORBIDDEN_CLIENT']);
  });

  it('su teisinga paslaptimi: 201', async () => {
    const res = await http()
      .post('/special-orders')
      .set('X-Internal-Secret', SECRET)
      .set('X-Client-IP', '203.0.113.10')
      .send(await body());
    expect(res.status).toBe(201);
  });

  it('užklausos be paslapties irgi skaičiuojamos ribojime', async () => {
    const b = await body();
    const direct = () => http().post('/special-orders').set('X-Real-IP', '198.51.100.88').send(b);
    for (let i = 0; i < 20; i++) expect((await direct()).status).toBe(403);
    const blocked = await direct();
    expect([blocked.status, blocked.body.code]).toEqual([429, 'TOO_MANY_REQUESTS']);
  });

  it('config ir access paslapties nereikalauja', async () => {
    expect((await http().get('/special-orders/config')).status).toBe(200);
    expect((await http().get(`/special-orders/access/${'A'.repeat(32)}`)).status).toBe(404);
  });
});

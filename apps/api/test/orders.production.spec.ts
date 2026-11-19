import './env/production';
import { Controller, Get, Req } from '@nestjs/common';
import request from 'supertest';
import type { ClientIpRequest } from '../src/common/client-ip';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  getQuantityAvailable,
  orderBody,
  type TestContext,
} from './helpers';

@Controller('test-client-ip')
class ClientIpEchoController {
  @Get()
  echo(@Req() req: ClientIpRequest) {
    return { ip: req.clientIp, source: req.clientIpSource };
  }
}

/** API su NODE_ENV=production (žr. env/production.ts). */
describe('Produkcija: POST /orders tik iš web serverio (INTERNAL_API_SECRET)', () => {
  let ctx: TestContext;
  const SECRET = process.env.INTERNAL_API_SECRET!;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestContext({ controllers: [ClientIpEchoController] });
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
  });

  async function setup() {
    const p = await createProduct(ctx);
    const variantId = p.variantIds[0]!;
    const window = await createSaleWindow(ctx, {
      items: [{ productId: p.productId, variantId, quantity: 10 }],
    });
    return { window, variantId, body: orderBody(window._id, [{ variantId, quantity: 2 }]) };
  }

  it('be paslapties: 403 FORBIDDEN_CLIENT, užsakymas nesukuriamas', async () => {
    const s = await setup();
    const res = await http().post('/orders').send(s.body);
    expect([res.status, res.body.code]).toEqual([403, 'FORBIDDEN_CLIENT']);
    expect(await ctx.orderModel.countDocuments()).toBe(0);
    expect(await getQuantityAvailable(ctx, s.window._id, s.variantId)).toBe(10);
  });

  it('su neteisinga paslaptimi: 403 FORBIDDEN_CLIENT (net su X-Client-IP)', async () => {
    const s = await setup();
    const res = await http()
      .post('/orders')
      .set('X-Internal-Secret', `${SECRET.slice(0, -1)}x`)
      .set('X-Client-IP', '203.0.113.9')
      .send(s.body);
    expect([res.status, res.body.code]).toEqual([403, 'FORBIDDEN_CLIENT']);
  });

  it('su teisinga paslaptimi: 201 (ir be X-Client-IP)', async () => {
    const s = await setup();
    const res = await http().post('/orders').set('X-Internal-Secret', SECRET).send(s.body);
    expect(res.status).toBe(201);
  });

  it('užklausos be paslapties irgi skaičiuojamos ribojime (ribojimas prieš paslapties patikrą)', async () => {
    const s = await setup();
    const direct = () => http().post('/orders').set('X-Real-IP', '198.51.100.77').send(s.body);
    for (let i = 0; i < 20; i++) expect((await direct()).status).toBe(403);
    const blocked = await direct();
    expect([blocked.status, blocked.body.code]).toEqual([429, 'TOO_MANY_REQUESTS']);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('kiti vieši maršrutai paslapties nereikalauja', async () => {
    expect((await http().get('/sale-windows/current')).status).toBe(200);
    expect((await http().get(`/orders/access/${'A'.repeat(32)}`)).status).toBe(404);
  });

  it('kliento IP produkcijoje: X-Real-IP (Railway), ne X-Forwarded-For', async () => {
    const res = await http()
      .get('/test-client-ip')
      .set('X-Forwarded-For', '203.0.113.200, 100.64.0.7')
      .set('X-Real-IP', '198.51.100.23');
    expect(res.body).toEqual({ ip: '198.51.100.23', source: 'direct' });
  });
});

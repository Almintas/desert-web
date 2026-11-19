import './env/trust-real-ip';
import { Controller, Get, Req } from '@nestjs/common';
import request from 'supertest';
import type { ClientIpRequest } from '../src/common/client-ip';
import { createTestContext, type TestContext } from './helpers';

@Controller('test-client-ip')
class ClientIpEchoController {
  @Get()
  echo(@Req() req: ClientIpRequest) {
    return { ip: req.clientIp, source: req.clientIpSource };
  }
}

const SECRET = process.env.INTERNAL_API_SECRET!;

/**
 * Kaip už Railway edge (TRUST_X_REAL_IP=true, numatyta produkcijoje). Railway viešoms
 * užklausoms pats nustato X-Real-IP (kliento IP), o X-Forwarded-For grandinėje gali būti keli
 * vidiniai šuoliai: `trust proxy 1` tada duotų paskutinį (Railway) adresą.
 * https://docs.railway.com/networking/public-networking/specs-and-limits
 */
describe('req.clientIp už Railway proxy (be patikimo X-Client-IP)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext({ controllers: [ClientIpEchoController] });
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  const echo = (headers: Record<string, string>) => {
    const req = request(ctx.app.getHttpServer()).get('/test-client-ip');
    for (const [k, v] of Object.entries(headers)) req.set(k, v);
    return req;
  };

  it('naudojamas X-Real-IP, o ne paskutinis X-Forwarded-For šuolis', async () => {
    const res = await echo({
      'X-Forwarded-For': '198.51.100.7, 100.64.0.2',
      'X-Real-IP': '198.51.100.7',
    });
    expect(res.body).toEqual({ ip: '198.51.100.7', source: 'direct' });
  });

  it('kliento suklastotas X-Forwarded-For nieko nekeičia (Railway X-Real-IP perrašo)', async () => {
    const res = await echo({ 'X-Forwarded-For': '1.2.3.4', 'X-Real-IP': '198.51.100.8' });
    expect(res.body.ip).toBe('198.51.100.8');
  });

  it('IPv6 X-Real-IP priimamas', async () => {
    const res = await echo({ 'X-Real-IP': '2001:db8::1' });
    expect(res.body.ip).toBe('2001:db8::1');
  });

  it('be X-Real-IP arba su netinkama reikšme: req.ip', async () => {
    expect((await echo({ 'X-Forwarded-For': '198.51.100.9' })).body.ip).toBe('198.51.100.9');
    expect((await echo({ 'X-Forwarded-For': '198.51.100.9', 'X-Real-IP': 'ne-ip' })).body.ip).toBe(
      '198.51.100.9',
    );
  });

  it('teisinga paslaptis + X-Client-IP turi pirmenybę prieš X-Real-IP', async () => {
    const res = await echo({
      'X-Real-IP': '100.64.0.9',
      'X-Internal-Secret': SECRET,
      'X-Client-IP': '203.0.113.9',
    });
    expect(res.body).toEqual({ ip: '203.0.113.9', source: 'forwarded' });
  });
});

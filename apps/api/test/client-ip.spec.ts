import { Controller, Get, Req } from '@nestjs/common';
import request from 'supertest';
import type { ClientIpRequest } from '../src/common/client-ip';
import { createTestContext, type TestContext } from './helpers';

/** Tik testams: grąžina, kokį kliento IP nustatė middleware. */
@Controller('test-client-ip')
class ClientIpEchoController {
  @Get()
  echo(@Req() req: ClientIpRequest) {
    return { ip: req.clientIp, source: req.clientIpSource };
  }
}

const SECRET = process.env.INTERNAL_API_SECRET!;

describe('req.clientIp (X-Client-IP tik su INTERNAL_API_SECRET)', () => {
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

  it('be paslapties X-Client-IP ignoruojamas: naudojamas req.ip', async () => {
    const res = await echo({ 'X-Forwarded-For': '198.51.100.7', 'X-Client-IP': '203.0.113.9' });
    expect(res.body).toEqual({ ip: '198.51.100.7', source: 'direct' });
  });

  it('su neteisinga paslaptimi X-Client-IP ignoruojamas', async () => {
    const res = await echo({
      'X-Forwarded-For': '198.51.100.7',
      'X-Client-IP': '203.0.113.9',
      'X-Internal-Secret': `${SECRET.slice(0, -1)}x`,
    });
    expect(res.body).toEqual({ ip: '198.51.100.7', source: 'direct' });
  });

  it('su teisinga paslaptimi naudojamas X-Client-IP', async () => {
    const res = await echo({
      'X-Forwarded-For': '198.51.100.7',
      'X-Client-IP': '203.0.113.9',
      'X-Internal-Secret': SECRET,
    });
    expect(res.body).toEqual({ ip: '203.0.113.9', source: 'forwarded' });
  });

  it('netinkamas IP net su paslaptimi ignoruojamas', async () => {
    const res = await echo({
      'X-Forwarded-For': '198.51.100.7',
      'X-Client-IP': 'ne-ip',
      'X-Internal-Secret': SECRET,
    });
    expect(res.body).toEqual({ ip: '198.51.100.7', source: 'direct' });
  });
});

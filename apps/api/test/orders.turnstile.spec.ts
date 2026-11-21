import { randomUUID } from 'node:crypto';
import { TURNSTILE_TEST_KEYS } from '@desert-web/shared';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import {
  createFetchSiteverifyClient,
  SITEVERIFY_TIMEOUT_MS,
  SiteverifyHttpError,
  type SiteverifyRequest,
  type SiteverifyResponse,
} from '../src/turnstile/siteverify';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  fakeSiteverify,
  getQuantityAvailable,
  orderBody,
  type TestContext,
  uniqueCustomer,
} from './helpers';

const SECRET = process.env.INTERNAL_API_SECRET!;

describe('Užsakymai: Cloudflare Turnstile', () => {
  let ctx: TestContext;
  const siteverify = jest.fn<Promise<SiteverifyResponse>, [SiteverifyRequest]>();

  /** Kaip web serveris: su paslaptimi ir pirkėjo IP. */
  const post = (body: object, clientIp = '203.0.113.50') =>
    request(ctx.app.getHttpServer())
      .post('/orders')
      .set('X-Internal-Secret', SECRET)
      .set('X-Client-IP', clientIp)
      .send(body);

  beforeAll(async () => {
    ctx = await createTestContext({ siteverify });
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    siteverify.mockReset();
    siteverify.mockImplementation(fakeSiteverify);
  });

  async function setup() {
    const p = await createProduct(ctx);
    const variantId = p.variantIds[0]!;
    const window = await createSaleWindow(ctx, {
      items: [{ productId: p.productId, variantId, quantity: 10 }],
    });
    return { window, variantId };
  }

  async function expectNothingReserved(s: Awaited<ReturnType<typeof setup>>): Promise<void> {
    expect(await getQuantityAvailable(ctx, s.window._id, s.variantId)).toBe(10);
    expect(await ctx.orderModel.countDocuments()).toBe(0);
  }

  it('galiojantis tokenas: 201; siteverify gauna secret, tokeną, pirkėjo IP ir clientRequestId', async () => {
    const s = await setup();
    const body = orderBody(s.window._id, [{ variantId: s.variantId, quantity: 2 }]);
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(siteverify).toHaveBeenCalledTimes(1);
    expect(siteverify).toHaveBeenCalledWith({
      secret: TURNSTILE_TEST_KEYS.secretPass,
      response: TURNSTILE_TEST_KEYS.dummyToken,
      remoteip: '203.0.113.50',
      idempotencyKey: body.clientRequestId,
    });
    expect(await getQuantityAvailable(ctx, s.window._id, s.variantId)).toBe(8);
  });

  it.each([['invalid-input-response'], ['timeout-or-duplicate'], ['missing-input-response']])(
    'netinkamas / pasibaigęs tokenas (%s): 403 TURNSTILE_FAILED, kiekis nerezervuojamas',
    async (code) => {
      const s = await setup();
      siteverify.mockResolvedValue({ success: false, 'error-codes': [code] });
      const res = await post(orderBody(s.window._id, [{ variantId: s.variantId, quantity: 2 }]));
      expect([res.status, res.body.code]).toEqual([403, 'TURNSTILE_FAILED']);
      expect(res.body.message).toBe(
        'Nepavyko patvirtinti, kad esate ne robotas. Bandykite dar kartą.',
      );
      await expectNothingReserved(s);
    },
  );

  it('Cloudflare nepasiekiamas: 503 TURNSTILE_UNAVAILABLE, užrašoma į logą, nieko nerezervuojama', async () => {
    const s = await setup();
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    siteverify.mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'));
    try {
      const res = await post(orderBody(s.window._id, [{ variantId: s.variantId, quantity: 2 }]));
      expect([res.status, res.body.code]).toEqual([503, 'TURNSTILE_UNAVAILABLE']);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/siteverify unreachable.*Timeout/));
    } finally {
      log.mockRestore();
    }
    await expectNothingReserved(s);
  });

  it.each([['internal-error'], ['invalid-input-secret'], ['bad-request']])(
    'Cloudflare klaida, kurios pirkėjas nepataisys (%s): 503 TURNSTILE_UNAVAILABLE',
    async (code) => {
      const s = await setup();
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      siteverify.mockResolvedValue({ success: false, 'error-codes': [code] });
      try {
        const res = await post(orderBody(s.window._id, [{ variantId: s.variantId, quantity: 1 }]));
        expect([res.status, res.body.code]).toEqual([503, 'TURNSTILE_UNAVAILABLE']);
        expect(log).toHaveBeenCalledWith(expect.stringContaining(code));
      } finally {
        log.mockRestore();
      }
      await expectNothingReserved(s);
    },
  );

  it('naujas užsakymas be tokeno: 403 TURNSTILE_FAILED, Cloudflare nekviečiamas', async () => {
    const s = await setup();
    const res = await post(
      orderBody(s.window._id, [{ variantId: s.variantId, quantity: 1 }], { turnstileToken: null }),
    );
    expect([res.status, res.body.code]).toEqual([403, 'TURNSTILE_FAILED']);
    expect(siteverify).not.toHaveBeenCalled();
    await expectNothingReserved(s);
  });

  it('per ilgas tokenas: 400 (Cloudflare tokenai iki 2048 simbolių)', async () => {
    const s = await setup();
    const res = await post(
      orderBody(s.window._id, [{ variantId: s.variantId, quantity: 1 }], {
        turnstileToken: 'x'.repeat(2049),
      }),
    );
    expect(res.status).toBe(400);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it('idempotentiškas pakartojimas be tokeno grąžina pirmąjį užsakymą (Turnstile netikrinamas)', async () => {
    const s = await setup();
    const customer = uniqueCustomer();
    const clientRequestId = randomUUID();
    const first = await post(
      orderBody(s.window._id, [{ variantId: s.variantId, quantity: 3 }], {
        customer,
        clientRequestId,
      }),
    );
    expect(first.status).toBe(201);
    siteverify.mockClear();
    // Tokenas jau panaudotas; Cloudflare jį dabar atmestų.
    siteverify.mockResolvedValue({ success: false, 'error-codes': ['timeout-or-duplicate'] });

    const replay = await post(
      orderBody(s.window._id, [{ variantId: s.variantId, quantity: 3 }], {
        customer,
        clientRequestId,
        turnstileToken: null,
      }),
    );
    expect(replay.status).toBe(200);
    expect(replay.body.order.id).toBe(first.body.order.id);
    expect(replay.body.accessToken).toBe(first.body.accessToken);
    expect(siteverify).not.toHaveBeenCalled();
    expect(await getQuantityAvailable(ctx, s.window._id, s.variantId)).toBe(7);
  });

  it('svetimas pakartojimas (kitas el. paštas) be tokeno: 409 IDEMPOTENCY_CONFLICT, ne užsakymas', async () => {
    const s = await setup();
    const clientRequestId = randomUUID();
    await post(
      orderBody(s.window._id, [{ variantId: s.variantId, quantity: 1 }], { clientRequestId }),
    ).expect(201);
    const res = await post(
      orderBody(s.window._id, [{ variantId: s.variantId, quantity: 1 }], {
        clientRequestId,
        turnstileToken: null,
      }),
    );
    expect([res.status, res.body.code]).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
  });
});

describe('createFetchSiteverifyClient (numatytas Cloudflare klientas)', () => {
  const URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POST form-urlencoded su secret, response, remoteip, idempotency_key ir 5 s limitu', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const result = await createFetchSiteverifyClient(URL)({
      secret: 's',
      response: 't',
      remoteip: '203.0.113.1',
      idempotencyKey: 'k',
    });
    expect(result).toEqual({ success: true });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(URL);
    expect(init?.method).toBe('POST');
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      secret: 's',
      response: 't',
      remoteip: '203.0.113.1',
      idempotency_key: 'k',
    });
    expect(timeout).toHaveBeenCalledWith(SITEVERIFY_TIMEOUT_MS);
    expect(SITEVERIFY_TIMEOUT_MS).toBe(5_000);
    timeout.mockRestore();
  });

  it('ne 2xx atsakymas ir tinklo klaida: klaida (servisas ją paverčia 503)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('oops', { status: 502 }));
    await expect(createFetchSiteverifyClient(URL)({ secret: 's', response: 't' })).rejects.toThrow(
      SiteverifyHttpError,
    );
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(createFetchSiteverifyClient(URL)({ secret: 's', response: 't' })).rejects.toThrow(
      'fetch failed',
    );
  });
});

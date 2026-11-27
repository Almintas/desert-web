import './env/emails';
import request from 'supertest';
import type { InMemoryEmailSender } from '../src/notifications/in-memory-email-sender';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  orderBody,
  type TestContext,
} from './helpers';

/**
 * Kiekvienas atvejis su savo konfigūracija: ConfigModule process.env skaito importuojant
 * AppModule, todėl aplinka keičiama prieš jest.isolateModules.
 */
async function contextWith(
  env: Record<string, string | undefined>,
): Promise<{ ctx: TestContext; logSpy: jest.SpyInstance }> {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  let ctx!: Promise<TestContext>;
  let logSpy!: jest.SpyInstance;
  jest.isolateModules(() => {
    // Izoliuotas registras turi savo @nestjs/common kopiją: Logger sekam būtent ją.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules veikia tik su sinchronišku require
    const { Logger } = require('@nestjs/common') as typeof import('@nestjs/common');
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- kaip ir aukščiau
    const helpers = require('./helpers') as typeof import('./helpers');
    ctx = helpers.createTestContext();
  });
  try {
    return { ctx: await ctx, logSpy };
  } finally {
    process.env = saved;
  }
}

const notSentLogs = (spy: jest.SpyInstance) =>
  spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('RESEND_API_KEY not set'));

async function placeOrder(ctx: TestContext): Promise<void> {
  const cake = await createProduct(ctx);
  const w = await createSaleWindow(ctx, {
    items: [{ productId: cake.productId, variantId: cake.variantIds[0]! }],
  });
  const res = await request(ctx.app.getHttpServer())
    .post('/orders')
    .send(orderBody(w._id, [{ variantId: cake.variantIds[0]!, quantity: 1 }]));
  expect(res.status).toBe(201);
}

async function sentAfter(ctx: TestContext, action: () => Promise<unknown>) {
  await action();
  await ctx.notifications.whenIdle();
  return (ctx.emails as InMemoryEmailSender).sent;
}

describe('Užsakymų laiškai: išjungti pagal konfigūraciją', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CUSTOMER_EMAILS_ENABLED=false: tik laiškas pardavėjui', async () => {
    const { ctx } = await contextWith({ CUSTOMER_EMAILS_ENABLED: 'false' });
    try {
      await clearDatabase(ctx.connection);
      const sent = await sentAfter(ctx, () => placeOrder(ctx));
      expect(sent.map((m) => m.to)).toEqual(['pardavejas@desertai.example']);
    } finally {
      await ctx.app.close();
    }
  });

  it('be ORDER_NOTIFY_EMAIL: tik laiškas pirkėjui', async () => {
    const { ctx } = await contextWith({ ORDER_NOTIFY_EMAIL: undefined });
    try {
      await clearDatabase(ctx.connection);
      const sent = await sentAfter(ctx, () => placeOrder(ctx));
      expect(sent).toHaveLength(1);
      expect(sent[0]!.idempotencyKey).toMatch(/^order-created\//);
    } finally {
      await ctx.app.close();
    }
  });

  it('be RESEND_API_KEY: nesiunčiama nieko (testų aplinkoje ir į logą neišvedama)', async () => {
    const { ctx, logSpy } = await contextWith({ RESEND_API_KEY: undefined });
    try {
      await clearDatabase(ctx.connection);
      const sent = await sentAfter(ctx, () => placeOrder(ctx));
      expect(sent).toHaveLength(0);
      expect(notSentLogs(logSpy)).toHaveLength(0);
    } finally {
      await ctx.app.close();
    }
  });

  it('be RESEND_API_KEY vystant (development): laiškas tik išvedamas į logą', async () => {
    const { ctx, logSpy } = await contextWith({
      RESEND_API_KEY: undefined,
      NODE_ENV: 'development',
    });
    try {
      await clearDatabase(ctx.connection);
      const sent = await sentAfter(ctx, () => placeOrder(ctx));
      expect(sent).toHaveLength(0);
      const logged = notSentLogs(logSpy);
      expect(logged).toHaveLength(2);
      expect(logged.join('\n')).toMatch(
        /To: pardavejas@desertai\.example\nSubject: Naujas užsakymas/,
      );
    } finally {
      await ctx.app.close();
    }
  });
});

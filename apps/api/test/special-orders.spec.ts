import { randomUUID } from 'node:crypto';
import {
  addCalendarDays,
  type CreateSpecialOrderResponse,
  shopToday,
  type SpecialOrderConfigDto,
  TURNSTILE_TEST_KEYS,
} from '@desert-web/shared';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { SpecialOrder } from '../src/special-orders/special-order.schema';
import { specialOrderDateRange } from '../src/special-orders/special-orders.service';
import type { SiteverifyRequest, SiteverifyResponse } from '../src/turnstile/siteverify';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  fakeSiteverify,
  getQuantityAvailable,
  orderBody,
  type ProductFixture,
  setSpecialOrderSettings,
  specialOrderBody,
  type TestContext,
  uniqueCustomer,
} from './helpers';

describe('Specialūs užsakymai (viešas API)', () => {
  let ctx: TestContext;
  let specialOrderModel: Model<SpecialOrder>;
  const siteverify = jest.fn<Promise<SiteverifyResponse>, [SiteverifyRequest]>();

  const http = () => request(ctx.app.getHttpServer());
  const post = (body: object) => http().post('/special-orders').send(body);

  beforeAll(async () => {
    ctx = await createTestContext({ siteverify });
    specialOrderModel = ctx.app.get(getModelToken(SpecialOrder.name));
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    siteverify.mockReset();
    siteverify.mockImplementation(fakeSiteverify);
  });

  /** Produktas su specialiais užsakymais (min. 10), du variantai. */
  async function eligibleProduct(minQuantity = 10): Promise<ProductFixture> {
    return createProduct(ctx, {
      name: 'Makaronai',
      variants: [
        { name: '6 vnt.', priceCents: 900 },
        { name: '12 vnt.', priceCents: 1700 },
      ],
      specialOrder: { enabled: true, minQuantity },
    });
  }

  describe('GET /special-orders/config', () => {
    it('išjungta (numatyta, nustatymų dokumento nėra): enabled false ir tuščias produktų sąrašas', async () => {
      await eligibleProduct();
      const res = await http().get('/special-orders/config');
      expect(res.status).toBe(200);
      const today = shopToday();
      expect(res.body).toEqual({
        enabled: false,
        leadTimeDays: 7,
        maxDaysAhead: 90,
        earliestDate: addCalendarDays(today, 7),
        latestDate: addCalendarDays(today, 90),
        products: [],
      });
      // Viešas GET nieko nerašo: nustatymų dokumentas nesukuriamas.
      expect(await ctx.connection.db!.collection('settings').countDocuments()).toBe(0);
    });

    it('įjungta: tik aktyvūs produktai su specialiais užsakymais, bazinės kainos ir minQuantity', async () => {
      await setSpecialOrderSettings(ctx, { leadTimeDays: 3, maxDaysAhead: 30 });
      const p = await createProduct(ctx, {
        name: 'Medaus tortas',
        variants: [{ name: '1 kg', priceCents: 2500 }],
        allergens: ['gliutenas'],
        description: 'Su medumi',
        specialOrder: { enabled: true, minQuantity: 5 },
      });
      await createProduct(ctx, {
        name: 'Be specialių',
        specialOrder: { enabled: false, minQuantity: 1 },
      });
      await createProduct(ctx, {
        name: 'Archyvuotas',
        specialOrder: { enabled: true, minQuantity: 1 },
        isActive: false,
      });

      const res = await http().get('/special-orders/config');
      expect(res.status).toBe(200);
      const body = res.body as SpecialOrderConfigDto;
      expect(body).toMatchObject({
        enabled: true,
        leadTimeDays: 3,
        maxDaysAhead: 30,
        earliestDate: addCalendarDays(shopToday(), 3),
        latestDate: addCalendarDays(shopToday(), 30),
      });
      expect(body.products).toEqual([
        {
          id: p.productId.toString(),
          name: 'Medaus tortas',
          slug: expect.any(String),
          description: 'Su medumi',
          category: 'tortai',
          allergens: ['gliutenas'],
          images: [],
          minQuantity: 5,
          variants: [{ id: p.variantIds[0]!.toString(), name: '1 kg', priceCents: 2500 }],
        },
      ]);
    });
  });

  describe('POST /special-orders', () => {
    it('sukuria užklausą: 201, numeris SP-metai-0001, kainų kopijos, pickup, unpaid, accessToken', async () => {
      await setSpecialOrderSettings(ctx);
      const p = await eligibleProduct();
      const customer = { name: 'Ona Onaitė', email: ' Ona@Example.com ', phone: '8 612 34567' };
      const body = specialOrderBody(
        [
          { variantId: p.variantIds[0]!, quantity: 10 },
          { variantId: p.variantIds[1]!, quantity: 20 },
        ],
        { customer, customerNotes: 'Gimtadieniui' },
      );
      const res = await post(body);
      expect(res.status).toBe(201);
      const { specialOrder, accessToken } = res.body as CreateSpecialOrderResponse;
      const year = new Date().getFullYear();
      expect(specialOrder.requestNumber).toMatch(new RegExp(`^SP-(${year}|${year + 1})-0001$`));
      expect(accessToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(specialOrder).toMatchObject({
        customer: { name: 'Ona Onaitė', email: 'Ona@Example.com', phone: '8 612 34567' },
        desiredDate: body.desiredDate,
        items: [
          {
            productName: 'Makaronai',
            variantName: '6 vnt.',
            quantity: 10,
            estimatedUnitPriceCents: 900,
            estimatedLineTotalCents: 9000,
          },
          {
            productName: 'Makaronai',
            variantName: '12 vnt.',
            quantity: 20,
            estimatedUnitPriceCents: 1700,
            estimatedLineTotalCents: 34000,
          },
        ],
        estimatedTotalCents: 43000,
        currency: 'EUR',
        customerNotes: 'Gimtadieniui',
        fulfillment: { method: 'pickup', address: null },
        status: 'requested',
        confirmation: null,
        rejectionReason: null,
        cancellation: null,
        payment: { status: 'unpaid', method: 'on_pickup', paidAt: null },
      });

      const stored = await specialOrderModel.findById(specialOrder.id).lean().exec();
      expect(stored).toMatchObject({
        customer: { emailNormalized: 'ona@example.com', phoneNormalized: '+37061234567' },
        statusHistory: [{ status: 'requested' }],
        clientRequestId: body.clientRequestId,
        accessToken,
      });
      expect(stored!.statusHistory[0]!.adminId).toBeUndefined();

      // Antra užklausa gauna kitą numerį.
      const second = await post(specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }]));
      expect(second.body.specialOrder.requestNumber).toMatch(/-0002$/);
    });

    it('pardavimo lango kiekių neliečia', async () => {
      await setSpecialOrderSettings(ctx);
      const p = await eligibleProduct(1);
      const variantId = p.variantIds[0]!;
      const window = await createSaleWindow(ctx, {
        items: [{ productId: p.productId, variantId, quantity: 5 }],
      });
      const res = await post(specialOrderBody([{ variantId, quantity: 50 }]));
      expect(res.status).toBe(201);
      expect(await getQuantityAvailable(ctx, window._id, variantId)).toBe(5);
      expect(await ctx.orderModel.countDocuments()).toBe(0);
    });

    it('išjungta nustatymuose: 409 SPECIAL_ORDERS_DISABLED', async () => {
      const p = await eligibleProduct();
      const res = await post(specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }]));
      expect([res.status, res.body.code]).toEqual([409, 'SPECIAL_ORDERS_DISABLED']);

      await setSpecialOrderSettings(ctx, { enabled: false });
      const again = await post(specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }]));
      expect([again.status, again.body.code]).toEqual([409, 'SPECIAL_ORDERS_DISABLED']);
      expect(await specialOrderModel.countDocuments()).toBe(0);
    });

    it.each([
      [
        'archyvuotas produktas',
        { isActive: false, specialOrder: { enabled: true, minQuantity: 1 } },
      ],
      [
        'produktui specialūs užsakymai išjungti',
        { specialOrder: { enabled: false, minQuantity: 1 } },
      ],
    ])('%s: 400 PRODUCT_NOT_AVAILABLE su details.items', async (_name, overrides) => {
      await setSpecialOrderSettings(ctx);
      const ok = await eligibleProduct(1);
      const bad = await createProduct(ctx, overrides);
      const res = await post(
        specialOrderBody([
          { variantId: ok.variantIds[0]!, quantity: 3 },
          { variantId: bad.variantIds[0]!, quantity: 4 },
        ]),
      );
      expect([res.status, res.body.code]).toEqual([400, 'PRODUCT_NOT_AVAILABLE']);
      expect(res.body.details.items).toEqual([
        { variantId: bad.variantIds[0]!.toString(), requested: 4 },
      ]);
      expect(await specialOrderModel.countDocuments()).toBe(0);
    });

    it('neegzistuojantis variantas: 400 PRODUCT_NOT_AVAILABLE', async () => {
      await setSpecialOrderSettings(ctx);
      const variantId = '0123456789abcdef01234567';
      const res = await post(specialOrderBody([{ variantId, quantity: 10 }]));
      expect([res.status, res.body.code]).toEqual([400, 'PRODUCT_NOT_AVAILABLE']);
      expect(res.body.details.items).toEqual([{ variantId, requested: 10 }]);
    });

    it('minimalus kiekis tikrinamas kiekvienai eilutei: 400 QUANTITY_BELOW_MINIMUM', async () => {
      await setSpecialOrderSettings(ctx);
      const p = await eligibleProduct(10);
      const other = await createProduct(ctx, { specialOrder: { enabled: true, minQuantity: 3 } });

      // Bendra suma (9 + 9 + 3) viršija minimumą, bet kiekviena eilutė turi jį pasiekti atskirai.
      const res = await post(
        specialOrderBody([
          { variantId: p.variantIds[0]!, quantity: 9 },
          { variantId: p.variantIds[1]!, quantity: 9 },
          { variantId: other.variantIds[0]!, quantity: 3 },
        ]),
      );
      expect([res.status, res.body.code]).toEqual([400, 'QUANTITY_BELOW_MINIMUM']);
      expect(res.body.message).toBe(
        'Kai kurių prekių kiekis mažesnis nei leidžiamas specialiam užsakymui.',
      );
      expect(res.body.details.items).toEqual([
        { variantId: p.variantIds[0]!.toString(), requested: 9, minimum: 10 },
        { variantId: p.variantIds[1]!.toString(), requested: 9, minimum: 10 },
      ]);

      const one = await post(specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 9 }]));
      expect(one.body.message).toBe('Mažiausias kiekis specialiam užsakymui: 10 vnt.');
      const exact = await post(specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }]));
      expect(exact.status).toBe(201);
    });

    describe('pageidaujama data (Vilniaus kalendorius)', () => {
      const today = () => shopToday();
      const postForDate = async (p: ProductFixture, desiredDate: string) =>
        post(specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }], { desiredDate }));

      it('leadTimeDays 7, maxDaysAhead 90: ribos imtinai', async () => {
        await setSpecialOrderSettings(ctx, { leadTimeDays: 7, maxDaysAhead: 90 });
        const p = await eligibleProduct();
        const earliest = addCalendarDays(today(), 7);
        const latest = addCalendarDays(today(), 90);

        const early = await postForDate(p, addCalendarDays(today(), 6));
        expect([early.status, early.body.code]).toEqual([400, 'DESIRED_DATE_TOO_EARLY']);
        expect(early.body.details).toEqual({ earliestDate: earliest });
        expect(early.body.message).toMatch(/^Anksčiausia galima data: /);

        const late = await postForDate(p, addCalendarDays(today(), 91));
        expect([late.status, late.body.code]).toEqual([400, 'DESIRED_DATE_TOO_LATE']);
        expect(late.body.details).toEqual({ latestDate: latest });

        expect((await postForDate(p, earliest)).status).toBe(201);
        expect((await postForDate(p, latest)).status).toBe(201);
      });

      it('leadTimeDays 0: šiandien galima, vakar ne', async () => {
        await setSpecialOrderSettings(ctx, { leadTimeDays: 0, maxDaysAhead: 1 });
        const p = await eligibleProduct();
        expect((await postForDate(p, today())).status).toBe(201);
        expect((await postForDate(p, addCalendarDays(today(), 1))).status).toBe(201);
        const yesterday = await postForDate(p, addCalendarDays(today(), -1));
        expect([yesterday.status, yesterday.body.code]).toEqual([400, 'DESIRED_DATE_TOO_EARLY']);
        expect(yesterday.body.details).toEqual({ earliestDate: today() });
        const late = await postForDate(p, addCalendarDays(today(), 2));
        expect(late.body.code).toBe('DESIRED_DATE_TOO_LATE');
      });

      it('netinkama data: 400 (schema)', async () => {
        await setSpecialOrderSettings(ctx);
        const p = await eligibleProduct();
        for (const desiredDate of ['2026-02-30', '2026-12-20T10:00:00Z', '20.12.2026', '']) {
          const res = await postForDate(p, desiredDate);
          expect(res.status).toBe(400);
          expect(res.body.issues).toEqual(
            expect.arrayContaining([expect.objectContaining({ path: 'desiredDate' })]),
          );
        }
      });

      it('saugoma kaip „YYYY-MM-DD“ eilutė ir grąžinama nepakitusi', async () => {
        await setSpecialOrderSettings(ctx);
        const p = await eligibleProduct();
        const desiredDate = addCalendarDays(today(), 10);
        const res = await postForDate(p, desiredDate);
        expect(res.body.specialOrder.desiredDate).toBe(desiredDate);
        const raw = await ctx.connection
          .db!.collection('specialOrders')
          .findOne({ requestNumber: res.body.specialOrder.requestNumber });
        expect(raw?.desiredDate).toBe(desiredDate);
      });
    });

    describe('DST savaitės (shopToday ir specialOrderDateRange)', () => {
      const settings = (leadTimeDays: number, maxDaysAhead = 90) => ({
        leadTimeDays,
        maxDaysAhead,
      });

      it.each([
        // Kovo persukimas 2026-03-29 03:00 EET -> 04:00 EEST.
        ['2026-03-28T21:59:00Z', 1, '2026-03-29'], // 23:59 EET kovo 28
        ['2026-03-28T22:00:00Z', 1, '2026-03-30'], // 00:00 EET kovo 29
        ['2026-03-29T00:30:00Z', 0, '2026-03-29'], // 02:30 EET, prieš persukimą
        ['2026-03-29T01:30:00Z', 0, '2026-03-29'], // 04:30 EEST, po persukimo
        ['2026-03-29T20:59:00Z', 7, '2026-04-05'], // 23:59 EEST kovo 29
        ['2026-03-29T21:00:00Z', 7, '2026-04-06'], // 00:00 EEST kovo 30
        // Spalio persukimas 2026-10-25 04:00 EEST -> 03:00 EET.
        ['2026-10-24T20:59:00Z', 1, '2026-10-25'], // 23:59 EEST spalio 24
        ['2026-10-24T21:00:00Z', 1, '2026-10-26'], // 00:00 EEST spalio 25
        ['2026-10-25T00:30:00Z', 0, '2026-10-25'], // 03:30 EEST (pirmas kartas)
        ['2026-10-25T01:30:00Z', 0, '2026-10-25'], // 03:30 EET (antras kartas)
        ['2026-10-25T21:59:00Z', 7, '2026-11-01'], // 23:59 EET spalio 25
        ['2026-10-25T22:00:00Z', 7, '2026-11-02'], // 00:00 EET spalio 26
      ])('now = %s, leadTimeDays %i -> anksčiausia %s', (now, leadTimeDays, earliest) => {
        expect(specialOrderDateRange(settings(leadTimeDays), new Date(now)).earliestDate).toBe(
          earliest,
        );
      });

      it('maxDaysAhead per persukimą skaičiuojamas kalendoriaus dienomis', () => {
        expect(specialOrderDateRange(settings(0, 3), new Date('2026-03-27T10:00:00Z'))).toEqual({
          earliestDate: '2026-03-27',
          latestDate: '2026-03-30',
        });
        expect(specialOrderDateRange(settings(0, 3), new Date('2026-10-23T10:00:00Z'))).toEqual({
          earliestDate: '2026-10-23',
          latestDate: '2026-10-26',
        });
      });

      it('POST naktį po kovo persukimo (fiksuotas laikas): ribos pagal Vilniaus datą', async () => {
        await setSpecialOrderSettings(ctx, { leadTimeDays: 1, maxDaysAhead: 2 });
        const p = await eligibleProduct();
        // 2026-03-28 22:30 UTC = kovo 29 d. 00:30 Vilniuje (UTC data dar kovo 28).
        jest.useFakeTimers({
          now: new Date('2026-03-28T22:30:00Z'),
          doNotFake: [
            'hrtime',
            'nextTick',
            'performance',
            'queueMicrotask',
            'requestAnimationFrame',
            'cancelAnimationFrame',
            'requestIdleCallback',
            'cancelIdleCallback',
            'setImmediate',
            'clearImmediate',
            'setInterval',
            'clearInterval',
            'setTimeout',
            'clearTimeout',
          ],
        });
        try {
          const early = await post(
            specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }], {
              desiredDate: '2026-03-29',
            }),
          );
          expect([early.status, early.body.code]).toEqual([400, 'DESIRED_DATE_TOO_EARLY']);
          expect(early.body.details).toEqual({ earliestDate: '2026-03-30' });

          const ok = await post(
            specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }], {
              desiredDate: '2026-03-31',
            }),
          );
          expect(ok.status).toBe(201);
          expect(ok.body.specialOrder.requestNumber).toBe('SP-2026-0001');

          const late = await post(
            specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }], {
              desiredDate: '2026-04-01',
            }),
          );
          expect(late.body).toMatchObject({
            code: 'DESIRED_DATE_TOO_LATE',
            details: { latestDate: '2026-03-31' },
          });
        } finally {
          jest.useRealTimers();
        }
      });
    });

    it('schema: kartojasi variantas, tuščias sąrašas, per ilgos pastabos, nesveikas kiekis', async () => {
      await setSpecialOrderSettings(ctx);
      const p = await eligibleProduct();
      const v = p.variantIds[0]!;
      const cases = [
        specialOrderBody([
          { variantId: v, quantity: 10 },
          { variantId: v, quantity: 11 },
        ]),
        specialOrderBody([]),
        specialOrderBody([{ variantId: v, quantity: 10 }], { customerNotes: 'x'.repeat(2001) }),
        specialOrderBody([{ variantId: v, quantity: 10.5 }]),
        { ...specialOrderBody([{ variantId: v, quantity: 10 }]), clientRequestId: 'ne-uuid' },
      ];
      for (const body of cases) expect((await post(body)).status).toBe(400);
      expect(await specialOrderModel.countDocuments()).toBe(0);
    });

    describe('idempotencija (clientRequestId)', () => {
      it('pakartojimas: 200, ta pati užklausa ir accessToken, be Turnstile', async () => {
        await setSpecialOrderSettings(ctx);
        const p = await eligibleProduct();
        const body = specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }]);
        const first = await post(body);
        expect(first.status).toBe(201);
        siteverify.mockClear();

        const replay = await post({ ...body, turnstileToken: undefined });
        expect(replay.status).toBe(200);
        expect(replay.body).toEqual(first.body);
        expect(siteverify).not.toHaveBeenCalled();
        expect(await specialOrderModel.countDocuments()).toBe(1);
      });

      it('pakartojimas grąžinamas ir išjungus specialius užsakymus', async () => {
        await setSpecialOrderSettings(ctx);
        const p = await eligibleProduct();
        const body = specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }]);
        const first = await post(body);
        await setSpecialOrderSettings(ctx, { enabled: false });
        const replay = await post(body);
        expect(replay.status).toBe(200);
        expect(replay.body.specialOrder.id).toBe(first.body.specialOrder.id);
      });

      it('tas pats ID kitam pirkėjui: 409 IDEMPOTENCY_CONFLICT', async () => {
        await setSpecialOrderSettings(ctx);
        const p = await eligibleProduct();
        const clientRequestId = randomUUID();
        await post(
          specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }], { clientRequestId }),
        ).expect(201);
        const res = await post(
          specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }], { clientRequestId }),
        );
        expect([res.status, res.body.code]).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
        expect(res.body.accessToken).toBeUndefined();
      });

      it('lygiagretūs dublikatai (dvigubas paspaudimas): sukuriama viena užklausa', async () => {
        await setSpecialOrderSettings(ctx);
        const p = await eligibleProduct();
        const body = specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }]);
        const responses = await Promise.all(Array.from({ length: 5 }, () => post(body)));
        expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
        expect(new Set(responses.map((r) => r.body.specialOrder.id)).size).toBe(1);
        expect(new Set(responses.map((r) => r.body.accessToken)).size).toBe(1);
        expect(await specialOrderModel.countDocuments()).toBe(1);
      });
    });

    describe('Turnstile', () => {
      it('tokeno nėra: 403 TURNSTILE_FAILED, Cloudflare nekviečiamas, nieko nesukuriama', async () => {
        await setSpecialOrderSettings(ctx);
        const p = await eligibleProduct();
        const res = await post(
          specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }], {
            turnstileToken: null,
          }),
        );
        expect([res.status, res.body.code]).toEqual([403, 'TURNSTILE_FAILED']);
        expect(siteverify).not.toHaveBeenCalled();
        expect(await specialOrderModel.countDocuments()).toBe(0);
      });

      it('netinkamas tokenas: 403; Cloudflare nepasiekiamas: 503 TURNSTILE_UNAVAILABLE', async () => {
        await setSpecialOrderSettings(ctx);
        const p = await eligibleProduct();
        const body = () => specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }]);
        siteverify.mockResolvedValueOnce({
          success: false,
          'error-codes': ['invalid-input-response'],
        });
        const invalid = await post(body());
        expect([invalid.status, invalid.body.code]).toEqual([403, 'TURNSTILE_FAILED']);

        siteverify.mockRejectedValueOnce(new TypeError('fetch failed'));
        const unavailable = await post(body());
        expect([unavailable.status, unavailable.body.code]).toEqual([503, 'TURNSTILE_UNAVAILABLE']);
        expect(await specialOrderModel.countDocuments()).toBe(0);
      });

      it('siteverify gauna pirkėjo IP (per web serverį) ir clientRequestId', async () => {
        await setSpecialOrderSettings(ctx);
        const p = await eligibleProduct();
        const body = specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }]);
        const res = await http()
          .post('/special-orders')
          .set('X-Internal-Secret', process.env.INTERNAL_API_SECRET!)
          .set('X-Client-IP', '203.0.113.77')
          .send(body);
        expect(res.status).toBe(201);
        expect(siteverify).toHaveBeenCalledWith({
          secret: TURNSTILE_TEST_KEYS.secretPass,
          response: TURNSTILE_TEST_KEYS.dummyToken,
          remoteip: '203.0.113.77',
          idempotencyKey: body.clientRequestId,
        });
      });
    });
  });

  describe('GET /special-orders/access/:token', () => {
    it('pirkėjo vaizdas be vidinių laukų', async () => {
      await setSpecialOrderSettings(ctx);
      const p = await eligibleProduct();
      const created = await post(
        specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 10 }], {
          customer: uniqueCustomer(),
        }),
      );
      const res = await http().get(`/special-orders/access/${created.body.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(created.body.specialOrder);
      const json = JSON.stringify(res.body);
      for (const field of [
        'statusHistory',
        'adminId',
        'clientRequestId',
        'accessToken',
        'emailNormalized',
        'phoneNormalized',
        'cancelledBy',
        'confirmedBy',
        '_id',
        '__v',
      ]) {
        expect(json).not.toContain(field);
      }
    });

    it('netinkamas ar nežinomas tokenas: 404', async () => {
      expect((await http().get('/special-orders/access/trumpas')).status).toBe(404);
      const res = await http().get(`/special-orders/access/${'A'.repeat(32)}`);
      expect([res.status, res.body.code]).toEqual([404, 'SPECIAL_ORDER_NOT_FOUND']);
    });

    it('užsakymo tokenas specialaus užsakymo nerodo (atskiros kolekcijos)', async () => {
      const p = await createProduct(ctx);
      const window = await createSaleWindow(ctx, {
        items: [{ productId: p.productId, variantId: p.variantIds[0]! }],
      });
      const order = await http()
        .post('/orders')
        .send(orderBody(window._id, [{ variantId: p.variantIds[0]!, quantity: 1 }]));
      expect(order.status).toBe(201);
      expect((await http().get(`/special-orders/access/${order.body.accessToken}`)).status).toBe(
        404,
      );
    });
  });
});

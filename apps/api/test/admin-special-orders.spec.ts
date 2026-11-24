import {
  addCalendarDays,
  type AdminSpecialOrderDto,
  type AdminSpecialOrderListResponse,
  shopToday,
  type SpecialOrderStatus,
} from '@desert-web/shared';
import request from 'supertest';
import {
  clearDatabase,
  createProduct,
  createTestContext,
  loginAdmin,
  type ProductFixture,
  setSpecialOrderSettings,
  specialOrderBody,
  type TestContext,
} from './helpers';

const HOUR = 3_600_000;
const iso = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR).toISOString();

const confirmBody = (overrides: Record<string, unknown> = {}) => ({
  totalCents: 12_345,
  adminMessage: 'Kaina su dėžutėmis',
  pickupFrom: iso(24 * 10),
  pickupTo: iso(24 * 10 + 2),
  pickupLocation: 'Gedimino pr. 1, Vilnius',
  ...overrides,
});

type Action = 'confirm' | 'reject' | 'cancel' | 'complete';
const ACTION_BODIES: Record<Action, object> = {
  confirm: confirmBody(),
  reject: { reason: 'Negalime tą dieną' },
  cancel: { reason: 'Pirkėjas persigalvojo' },
  complete: {},
};
const ACTION_TARGET: Record<Action, SpecialOrderStatus> = {
  confirm: 'confirmed',
  reject: 'rejected',
  cancel: 'cancelled',
  complete: 'completed',
};

describe('Admin specialūs užsakymai', () => {
  let ctx: TestContext;
  let token: string;
  let product: ProductFixture;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test, t = token) => req.set('Authorization', `Bearer ${t}`);
  const act = (id: string, action: Action, body: object = ACTION_BODIES[action], t = token) =>
    auth(http().post(`/admin/special-orders/${id}/${action}`).send(body), t);
  const get = (id: string) => auth(http().get(`/admin/special-orders/${id}`));
  const list = (query = '') => auth(http().get(`/admin/special-orders${query}`));

  /** Nauja užklausa per viešą API. */
  async function createRequest(
    overrides: Parameters<typeof specialOrderBody>[1] = {},
    quantity = 10,
  ): Promise<{ id: string; requestNumber: string; accessToken: string }> {
    const res = await http()
      .post('/special-orders')
      .send(specialOrderBody([{ variantId: product.variantIds[0]!, quantity }], overrides));
    expect(res.status).toBe(201);
    return { ...res.body.specialOrder, accessToken: res.body.accessToken };
  }

  /** Užklausa, perkelta į nurodytą būseną. */
  async function requestIn(status: SpecialOrderStatus): Promise<string> {
    const { id } = await createRequest();
    const path: Record<SpecialOrderStatus, Action[]> = {
      requested: [],
      confirmed: ['confirm'],
      completed: ['confirm', 'complete'],
      rejected: ['reject'],
      cancelled: ['cancel'],
    };
    for (const action of path[status]) expect((await act(id, action)).status).toBe(200);
    return id;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    await setSpecialOrderSettings(ctx, { leadTimeDays: 0, maxDaysAhead: 60 });
    token = await loginAdmin(ctx);
    product = await createProduct(ctx, {
      name: 'Makaronai',
      variants: [{ name: '12 vnt.', priceCents: 1500 }],
      specialOrder: { enabled: true, minQuantity: 10 },
    });
  });

  it('be prisijungimo: 401', async () => {
    expect((await http().get('/admin/special-orders')).status).toBe(401);
    expect((await http().get('/admin/special-orders/stats')).status).toBe(401);
    const { id } = await createRequest();
    expect((await http().post(`/admin/special-orders/${id}/complete`)).status).toBe(401);
  });

  describe('perėjimai', () => {
    const allowed: [SpecialOrderStatus, Action][] = [
      ['requested', 'confirm'],
      ['requested', 'reject'],
      ['requested', 'cancel'],
      ['confirmed', 'complete'],
      ['confirmed', 'cancel'],
    ];
    const all: Action[] = ['confirm', 'reject', 'cancel', 'complete'];
    const statuses: SpecialOrderStatus[] = [
      'requested',
      'confirmed',
      'completed',
      'rejected',
      'cancelled',
    ];
    const forbidden = statuses.flatMap((s) =>
      all
        .filter((a) => !allowed.some(([from, action]) => from === s && action === a))
        .map((a): [SpecialOrderStatus, Action] => [s, a]),
    );

    it.each(allowed)('%s -> %s: 200, istorijoje adminas', async (from, action) => {
      const id = await requestIn(from);
      const res = await act(id, action);
      expect(res.status).toBe(200);
      const dto = res.body as AdminSpecialOrderDto;
      expect(dto.status).toBe(ACTION_TARGET[action]);
      const last = dto.statusHistory.at(-1)!;
      expect(last).toMatchObject({ status: ACTION_TARGET[action], adminId: expect.any(String) });
      expect(last.adminEmail).toMatch(/^admin\d+@example\.com$/);
    });

    it.each(forbidden)(
      '%s -> %s: 409 INVALID_STATUS_TRANSITION, niekas nekeičiama',
      async (from, action) => {
        const id = await requestIn(from);
        const before = (await get(id)).body as AdminSpecialOrderDto;
        const res = await act(id, action);
        expect([res.status, res.body.code]).toEqual([409, 'INVALID_STATUS_TRANSITION']);
        expect(res.body).toMatchObject({ status: from, requestedStatus: ACTION_TARGET[action] });
        expect(typeof res.body.message).toBe('string');
        const after = (await get(id)).body as AdminSpecialOrderDto;
        expect(after).toEqual(before);
      },
    );

    it('nežinomas ar netinkamas ID: 404 SPECIAL_ORDER_NOT_FOUND', async () => {
      for (const id of ['0123456789abcdef01234567', 'ne-id']) {
        const res = await act(id, 'complete');
        expect([res.status, res.body.code]).toEqual([404, 'SPECIAL_ORDER_NOT_FOUND']);
        expect((await get(id)).status).toBe(404);
      }
    });
  });

  describe('confirm', () => {
    it('išsaugo galutinę kainą, žinutę ir atsiėmimą; galutinė suma gali skirtis nuo apskaičiuotos', async () => {
      const { id } = await createRequest({}, 20);
      const body = confirmBody({ totalCents: 25_000 });
      const res = await act(id, 'confirm', body);
      expect(res.status).toBe(200);
      const dto = res.body as AdminSpecialOrderDto;
      expect(dto.estimatedTotalCents).toBe(30_000);
      expect(dto.confirmation).toEqual({
        totalCents: 25_000,
        adminMessage: 'Kaina su dėžutėmis',
        pickupFrom: body.pickupFrom,
        pickupTo: body.pickupTo,
        pickupLocation: 'Gedimino pr. 1, Vilnius',
        confirmedAt: expect.any(String),
      });
      expect(dto.payment).toEqual({ status: 'unpaid', method: 'on_pickup', paidAt: null });
    });

    it('validacija: atsiėmimo vieta privaloma, pabaiga po pradžios, kaina sveikasis skaičius', async () => {
      const { id } = await createRequest();
      const cases: [Record<string, unknown>, string][] = [
        [{ pickupLocation: '  ' }, 'pickupLocation'],
        [{ pickupLocation: undefined }, 'pickupLocation'],
        [{ pickupTo: iso(24 * 10 - 1) }, 'pickupTo'],
        [{ pickupFrom: '2026-12-20T10:00' }, 'pickupFrom'],
        [{ totalCents: 12.5 }, 'totalCents'],
        [{ totalCents: -1 }, 'totalCents'],
      ];
      for (const [override, path] of cases) {
        const res = await act(id, 'confirm', confirmBody(override));
        expect(res.status).toBe(400);
        expect(res.body.issues.map((i: { path: string }) => i.path)).toContain(path);
      }
      expect((await get(id)).body.status).toBe('requested');
    });

    it('žinutė neprivaloma (tuščia -> null)', async () => {
      const { id } = await createRequest();
      const res = await act(id, 'confirm', confirmBody({ adminMessage: '  ' }));
      expect(res.body.confirmation.adminMessage).toBeNull();
    });
  });

  it('reject: priežastis privaloma ir rodoma pirkėjui', async () => {
    const { id, accessToken } = await createRequest();
    const missing = await act(id, 'reject', { reason: ' ' });
    expect(missing.status).toBe(400);
    const res = await act(id, 'reject', { reason: 'Tą dieną neturime laiko' });
    expect(res.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Tą dieną neturime laiko',
    });
    const customer = await http().get(`/special-orders/access/${accessToken}`);
    expect(customer.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Tą dieną neturime laiko',
    });
  });

  it('cancel: priežastis neprivaloma; cancelledBy tik admino vaizde', async () => {
    const { id, accessToken } = await createRequest();
    const res = await act(id, 'cancel', {});
    expect(res.status).toBe(200);
    expect(res.body.cancellation).toEqual({
      reason: null,
      cancelledAt: expect.any(String),
      cancelledBy: expect.any(String),
    });
    const customer = await http().get(`/special-orders/access/${accessToken}`);
    expect(customer.body.cancellation).toEqual({ reason: null, cancelledAt: expect.any(String) });
  });

  it('complete: payment paid su paidAt; pirkėjas mato patvirtinimą ir apmokėjimą', async () => {
    const { id, accessToken } = await createRequest();
    await act(id, 'confirm').expect(200);
    const res = await act(id, 'complete');
    expect(res.body.payment).toEqual({
      status: 'paid',
      method: 'on_pickup',
      paidAt: expect.any(String),
    });
    expect(res.body.statusHistory.map((h: { status: string }) => h.status)).toEqual([
      'requested',
      'confirmed',
      'completed',
    ]);
    expect(res.body.statusHistory[0]).toMatchObject({ adminId: null, adminEmail: null });
    const customer = await http().get(`/special-orders/access/${accessToken}`);
    expect(customer.body).toMatchObject({
      status: 'completed',
      payment: { status: 'paid' },
      confirmation: { totalCents: 12_345 },
    });
  });

  it('staff gali valdyti užklausas', async () => {
    const staff = await loginAdmin(ctx, 'staff');
    const { id } = await createRequest();
    expect((await act(id, 'confirm', ACTION_BODIES.confirm, staff)).status).toBe(200);
  });

  describe('sąrašas', () => {
    it('rikiuojama pagal pageidaujamą datą, filtrai: būsena, datų intervalas, paieška; counts', async () => {
      const today = shopToday();
      const a = await createRequest({
        desiredDate: addCalendarDays(today, 20),
        customer: { name: 'Ona Onaitė', email: 'ona@example.com', phone: '+37061111111' },
      });
      const b = await createRequest({
        desiredDate: addCalendarDays(today, 5),
        customer: { name: 'Jonas Jonaitis', email: 'jonas@example.com', phone: '8 622 22222' },
      });
      const c = await createRequest({
        desiredDate: addCalendarDays(today, 10),
        customer: { name: 'Petras', email: 'petras@example.com', phone: '+37063333333' },
      });
      await act(c.id, 'reject').expect(200);
      await act(a.id, 'confirm', confirmBody({ totalCents: 99_00 })).expect(200);

      const all = (await list()).body as AdminSpecialOrderListResponse;
      expect(all.items.map((i) => i.id)).toEqual([b.id, c.id, a.id]);
      expect(all.counts).toMatchObject({
        all: 3,
        requested: 1,
        confirmed: 1,
        rejected: 1,
        completed: 0,
        cancelled: 0,
      });
      expect(all.items[2]).toMatchObject({
        requestNumber: a.requestNumber,
        customer: { name: 'Ona Onaitė', email: 'ona@example.com', phone: '+37061111111' },
        items: [{ productName: 'Makaronai', variantName: '12 vnt.', quantity: 10 }],
        estimatedTotalCents: 15_000,
        totalCents: 99_00,
        status: 'confirmed',
      });
      expect(all.items[0]!.totalCents).toBeNull();

      const active = (await list('?status=requested,confirmed')).body;
      expect(active.items.map((i: { id: string }) => i.id)).toEqual([b.id, a.id]);
      expect(active.total).toBe(2);
      expect(active.counts.all).toBe(3);

      const range = (
        await list(
          `?desiredFrom=${addCalendarDays(today, 6)}&desiredTo=${addCalendarDays(today, 20)}`,
        )
      ).body;
      expect(range.items.map((i: { id: string }) => i.id)).toEqual([c.id, a.id]);
      expect(range.counts.all).toBe(2);

      const search = async (q: string) =>
        (
          (await list(`?q=${encodeURIComponent(q)}`)).body as AdminSpecialOrderListResponse
        ).items.map((i) => i.id);
      expect(await search(b.requestNumber)).toEqual([b.id]);
      expect(await search('onaitė')).toEqual([a.id]);
      expect(await search('JONAS@EXAMPLE')).toEqual([b.id]);
      expect(await search('8622')).toEqual([b.id]);
      expect(await search('+370 633')).toEqual([c.id]);
    });

    it('puslapiavimas ir netinkami filtrai', async () => {
      for (let i = 0; i < 3; i++) await createRequest();
      const page = (await list('?pageSize=2&page=2')).body;
      expect([page.items.length, page.total, page.page, page.pageSize]).toEqual([1, 3, 2, 2]);
      expect((await list('?status=laukia')).status).toBe(400);
      expect((await list('?desiredFrom=2026-02-30')).status).toBe(400);
    });

    it('stats: naujų (requested) užklausų skaičius', async () => {
      const a = await createRequest();
      await createRequest();
      await createRequest();
      await act(a.id, 'reject').expect(200);
      const res = await auth(http().get('/admin/special-orders/stats'));
      expect(res.body).toEqual({ requested: 2 });
    });
  });

  it('detalė: visa informacija su istorija ir pastabomis', async () => {
    const { id } = await createRequest({ customerNotes: 'Be riešutų' });
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      customerNotes: 'Be riešutų',
      statusHistory: [{ status: 'requested', adminId: null, adminEmail: null }],
      cancellation: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|clientRequestId|Normalized/);
  });
});

describe('Admin nustatymai (/admin/settings)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
  });

  const put = (token: string, specialOrders: object) =>
    http().put('/admin/settings').set('Authorization', `Bearer ${token}`).send({ specialOrders });

  it('GET sukuria dokumentą su numatytosiomis reikšmėmis (owner ir staff)', async () => {
    const staff = await loginAdmin(ctx, 'staff');
    const res = await http().get('/admin/settings').set('Authorization', `Bearer ${staff}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      specialOrders: { enabled: false, leadTimeDays: 7, maxDaysAhead: 90 },
      updatedAt: expect.any(String),
    });
    const stored = await ctx.connection
      .db!.collection<{ _id: string; specialOrders?: unknown }>('settings')
      .findOne({
        _id: 'global',
      });
    expect(stored?.specialOrders).toEqual({ enabled: false, leadTimeDays: 7, maxDaysAhead: 90 });
  });

  it('PUT: owner keičia, staff gauna 403, be prisijungimo 401', async () => {
    const owner = await loginAdmin(ctx, 'owner');
    const staff = await loginAdmin(ctx, 'staff');
    const value = { enabled: true, leadTimeDays: 0, maxDaysAhead: 30 };

    expect((await put(staff, value)).status).toBe(403);
    expect((await http().put('/admin/settings').send({ specialOrders: value })).status).toBe(401);

    const res = await put(owner, value);
    expect(res.status).toBe(200);
    expect(res.body.specialOrders).toEqual(value);

    const config = await http().get('/special-orders/config');
    expect(config.body).toMatchObject({
      enabled: true,
      leadTimeDays: 0,
      maxDaysAhead: 30,
      earliestDate: shopToday(),
    });
  });

  it('PUT validacija: ribos ir maxDaysAhead >= leadTimeDays', async () => {
    const owner = await loginAdmin(ctx, 'owner');
    const cases: [object, string][] = [
      [{ enabled: true, leadTimeDays: -1, maxDaysAhead: 90 }, 'specialOrders.leadTimeDays'],
      [{ enabled: true, leadTimeDays: 61, maxDaysAhead: 90 }, 'specialOrders.leadTimeDays'],
      [{ enabled: true, leadTimeDays: 7, maxDaysAhead: 0 }, 'specialOrders.maxDaysAhead'],
      [{ enabled: true, leadTimeDays: 7, maxDaysAhead: 366 }, 'specialOrders.maxDaysAhead'],
      [{ enabled: true, leadTimeDays: 10, maxDaysAhead: 5 }, 'specialOrders.maxDaysAhead'],
      [{ enabled: true, leadTimeDays: 1.5, maxDaysAhead: 5 }, 'specialOrders.leadTimeDays'],
      [{ enabled: 'taip', leadTimeDays: 1, maxDaysAhead: 5 }, 'specialOrders.enabled'],
    ];
    for (const [value, path] of cases) {
      const res = await put(owner, value);
      expect(res.status).toBe(400);
      expect(res.body.issues.map((i: { path: string }) => i.path)).toContain(path);
    }
    // Ribos imtinai.
    expect((await put(owner, { enabled: false, leadTimeDays: 60, maxDaysAhead: 365 })).status).toBe(
      200,
    );
    expect((await put(owner, { enabled: false, leadTimeDays: 0, maxDaysAhead: 1 })).status).toBe(
      200,
    );
  });
});

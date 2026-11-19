import type { AdminSaleWindowDto, AdminSaleWindowInputBody } from '@desert-web/shared';
import request from 'supertest';
import {
  bodyFrom,
  clearDatabase,
  createProduct,
  createTestContext,
  item,
  loginAdmin,
  type ProductFixture,
  type TestContext,
  windowBody,
} from './helpers';

const NO_PICKUP: AdminSaleWindowInputBody['fulfillment'] = {
  pickupAvailable: true,
  deliveryAvailable: false,
};

describe('Admin pardavimo langai: atsiėmimo informacija privaloma skelbiant', () => {
  let ctx: TestContext;
  let token: string;
  let cake: ProductFixture;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const create = (body: object) => auth(http().post('/admin/sale-windows').send(body));
  const update = (id: string, body: object) =>
    auth(http().put(`/admin/sale-windows/${id}`).send(body));
  const action = (id: string, name: string) =>
    auth(http().post(`/admin/sale-windows/${id}/${name}`));

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    token = await loginAdmin(ctx);
    cake = await createProduct(ctx);
  });

  async function draft(fulfillment = NO_PICKUP): Promise<AdminSaleWindowDto> {
    const res = await create(windowBody([item(cake)], { fulfillment }));
    expect(res.status).toBe(201);
    return res.body as AdminSaleWindowDto;
  }

  it('juodraštį be atsiėmimo informacijos galima sukurti ir išsaugoti', async () => {
    const w = await draft();
    expect(w.status).toBe('draft');
    expect(w.fulfillment.pickupLocation).toBeNull();
    const saved = await update(w.id, bodyFrom(w, { title: 'Pervadintas' }));
    expect(saved.status).toBe(200);
  });

  it.each(['publish', 'open-now'])(
    '%s be atsiėmimo informacijos: 409 PICKUP_INFO_REQUIRED su trūkstamais laukais',
    async (name) => {
      const w = await draft();
      const res = await action(w.id, name);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PICKUP_INFO_REQUIRED');
      expect(res.body.missing).toEqual(['pickupLocation', 'pickupFrom', 'pickupTo']);
      const stored = await ctx.saleWindowModel.findById(w.id).lean().exec();
      expect(stored?.status).toBe('draft');
    },
  );

  it.each(['publish', 'open-now'])('%s be vienos reikšmės (tik vieta): 409', async (name) => {
    const w = await draft({ ...NO_PICKUP, pickupLocation: 'Vilnius' });
    const res = await action(w.id, name);
    expect(res.status).toBe(409);
    expect(res.body.missing).toEqual(['pickupFrom', 'pickupTo']);
  });

  it('atsiėmimas išjungtas (tik pristatymas): skelbti negalima', async () => {
    const res = await create(
      windowBody([item(cake)], {
        fulfillment: { pickupAvailable: false, deliveryAvailable: true },
      }),
    );
    expect(res.status).toBe(201);
    const published = await action(res.body.id, 'publish');
    expect(published.status).toBe(409);
    expect(published.body.missing).toContain('pickupAvailable');
  });

  it.each(['publish', 'open-now'])('%s su visa atsiėmimo informacija: 200', async (name) => {
    const w = await draft(windowBody([]).fulfillment);
    const res = await action(w.id, name);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
  });

  it('paskelbto lango atsiėmimo informacijos ištrinti negalima', async () => {
    const w = await draft(windowBody([]).fulfillment);
    const published = (await action(w.id, 'publish')).body as AdminSaleWindowDto;
    const res = await update(w.id, bodyFrom(published, { fulfillment: NO_PICKUP }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PICKUP_INFO_REQUIRED');

    const unchanged = await update(w.id, bodyFrom(published, { title: 'Naujas pavadinimas' }));
    expect(unchanged.status).toBe(200);
  });
});

import './env/emails';
import { DEFAULT_SHOP_INFO, formatEur, SHOP_NAME } from '@desert-web/shared';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import type { Order } from '../src/orders/order.schema';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  loginAdmin,
  orderBody,
  type ProductFixture,
  type TestContext,
  uniqueCustomer,
} from './helpers';

const WEB_URL = 'https://desertai.example'; // env: su pabaigos „/“, kuris nukerpamas
const ADMIN_URL = 'https://admin.desertai.example';
const FROM = `${SHOP_NAME} <uzsakymai@desertai.example>`; // kaip env/emails.ts
const SELLER_EMAIL = 'pardavejas@desertai.example';

describe('Užsakymų laiškai (visi įjungti)', () => {
  let ctx: TestContext;
  let token: string;
  let cake: ProductFixture;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const setStatus = (id: string, status: string) =>
    auth(http().post(`/admin/orders/${id}/status`).send({ status }));
  const cancel = (id: string, body: object = {}) =>
    auth(http().post(`/admin/orders/${id}/cancel`).send(body));
  /** Fone siunčiami laiškai: palaukiam, kol visi apdoroti. */
  const settled = async () => {
    await ctx.notifications.whenIdle();
    return ctx.emails.sent;
  };

  async function newWindow() {
    return createSaleWindow(ctx, {
      items: [{ productId: cake.productId, variantId: cake.variantIds[0]!, priceCents: 1250 }],
      deliveryAvailable: false,
    });
  }

  async function placeOrder(
    overrides: Parameters<typeof orderBody>[2] = {},
    quantity = 1,
  ): Promise<{ id: string; orderNumber: string; accessToken: string; body: object }> {
    const w = await newWindow();
    const body = orderBody(w._id, [{ variantId: cake.variantIds[0]!, quantity }], overrides);
    const res = await http().post('/orders').send(body);
    expect(res.status).toBe(201);
    return {
      id: res.body.order.id,
      orderNumber: res.body.order.orderNumber,
      accessToken: res.body.accessToken,
      body,
    };
  }

  /** Užsakymas su jau išsiųstais „gautas“ laiškais (sąrašas išvalytas). */
  async function placeOrderQuietly() {
    const order = await placeOrder();
    await settled();
    ctx.emails.clear();
    return order;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    await clearDatabase(ctx.connection);
    token = await loginAdmin(ctx);
    cake = await createProduct(ctx, {
      name: 'Medaus tortas',
      variants: [{ name: '1 kg', priceCents: 1250 }],
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await ctx.notifications.whenIdle();
    ctx.emails.clear();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  describe('pardavėjo duomenys iš nustatymų', () => {
    const saveShop = (seller: Partial<typeof DEFAULT_SHOP_INFO.seller>) =>
      request(ctx.app.getHttpServer())
        .put('/admin/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shop: { ...DEFAULT_SHOP_INFO, seller: { ...DEFAULT_SHOP_INFO.seller, ...seller } },
        });

    afterEach(async () => {
      await ctx.connection.db!.collection('settings').deleteMany({});
    });

    it('Reply-To ir laiško poraštė: išsaugotas el. paštas, vardas ir telefonas', async () => {
      const saved = await saveShop({
        name: 'UAB Saldainis',
        email: 'kontaktai@saldainis.example',
        phone: '+370 611 22222',
      });
      expect(saved.status).toBe(200);
      const customer = uniqueCustomer();
      await placeOrder({ customer });
      const toCustomer = (await settled()).find((m) => m.to === customer.email)!;
      expect(toCustomer.replyTo).toBe('kontaktai@saldainis.example');
      for (const body of [toCustomer.html, toCustomer.text]) {
        expect(body).toContain('UAB Saldainis');
        expect(body).toContain('kontaktai@saldainis.example');
        expect(body).toContain('+370 611 22222');
        expect(body).not.toContain(DEFAULT_SHOP_INFO.seller.email);
      }
    });

    it('atsiėmimas iš nustatymų: išsaugota vieta ir laikas', async () => {
      const saved = await request(ctx.app.getHttpServer())
        .put('/admin/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          pickup: { location: 'Vilnius, Gedimino pr. 1', hours: 'Pirm.–penkt. 17:00–20:00' },
        });
      expect(saved.status).toBe(200);
      const customer = uniqueCustomer();
      await placeOrder({ customer });
      for (const m of await settled()) {
        expect(m.text).toContain('Atsiėmimas: Vilnius, Gedimino pr. 1, Pirm.–penkt. 17:00–20:00');
        expect(m.html).toContain('Vilnius, Gedimino pr. 1, Pirm.–penkt. 17:00–20:00');
      }
    });

    it('išsaugotas tuščias el. paštas: be Reply-To, vardo vietoje parduotuvės pavadinimas', async () => {
      expect((await saveShop({ name: '', email: '' })).status).toBe(200);
      const customer = uniqueCustomer();
      await placeOrder({ customer });
      const toCustomer = (await settled()).find((m) => m.to === customer.email)!;
      expect(toCustomer.replyTo).toBeUndefined();
      expect(toCustomer.text).toContain(`--\n${SHOP_NAME}\n`);
    });
  });

  describe('naujas užsakymas', () => {
    it('vienas laiškas pirkėjui ir vienas pardavėjui su teisingais duomenimis', async () => {
      const customer = uniqueCustomer();
      const order = await placeOrder(
        { customer, fulfillment: { method: 'pickup', notes: 'Atvažiuosiu 15 val.' } },
        2,
      );
      const sent = await settled();
      expect(sent).toHaveLength(2);

      const toCustomer = sent.find((m) => m.to === customer.email)!;
      expect(toCustomer).toMatchObject({
        from: FROM,
        // Nustatymai dar neišsaugoti: numatytasis pardavėjo el. paštas.
        replyTo: DEFAULT_SHOP_INFO.seller.email,
        idempotencyKey: `order-created/${order.id}`,
      });
      expect(toCustomer.subject).toContain(order.orderNumber);
      expect(toCustomer.text).toContain('Atsiėmimas: Kovo 11-osios g. 33, Kaunas, 17:00–20:00');
      for (const body of [toCustomer.html, toCustomer.text]) {
        expect(body).toContain('Medaus tortas 1 kg');
        expect(body).toContain('× 2');
        expect(body).toContain(formatEur(2500)); // 2 × 12,50 €
        // Nustatymai neišsaugoti: numatytoji vieta (pardavėjo adresas) ir laikas.
        expect(body).toContain('Kovo 11-osios g. 33, Kaunas, 17:00–20:00');
        expect(body).toContain('atsiimant');
        expect(body).toContain('Atvažiuosiu 15 val.');
        expect(body).toContain(`${WEB_URL}/uzsakymas/${order.accessToken}`);
      }

      const toSeller = sent.find((m) => m.to === SELLER_EMAIL)!;
      expect(toSeller).toMatchObject({
        from: FROM,
        replyTo: customer.email,
        idempotencyKey: `seller-new-order/${order.id}`,
      });
      expect(toSeller.subject).toContain(order.orderNumber);
      for (const body of [toSeller.html, toSeller.text]) {
        expect(body).toContain(customer.name);
        expect(body).toContain(customer.phone);
        expect(body).toContain(customer.email);
        expect(body).toContain('Atvažiuosiu 15 val.');
        expect(body).toContain(formatEur(2500));
        expect(body).toContain(`${ADMIN_URL}/orders/${order.id}`);
      }
      // Pardavėjo laiške nėra slaptos pirkėjo nuorodos.
      expect(toSeller.html).not.toContain(order.accessToken);
    });

    it('idempotentiškas pakartojimas (tas pats clientRequestId) laiškų nesiunčia', async () => {
      const order = await placeOrder();
      expect(await settled()).toHaveLength(2);

      const replay = await http().post('/orders').send(order.body);
      expect(replay.status).toBe(200);
      expect(replay.body.order.id).toBe(order.id);
      expect(await settled()).toHaveLength(2);
    });

    it('laiško klaida užsakymo nesugadina: 201, užsakymas DB, klaida loge', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      ctx.emails.failWith = Object.assign(new Error('You can only send testing emails'), {
        code: 'validation_error',
        statusCode: 403,
      });

      const order = await placeOrder();
      await settled();
      expect(await ctx.orderModel.exists({ _id: order.id })).not.toBeNull();

      const messages = logged.mock.calls.map((c) => String(c[0]));
      for (const template of ['order-created', 'seller-new-order']) {
        expect(messages).toContainEqual(
          expect.stringMatching(
            new RegExp(`order ${order.id}, template ${template}.*403.*testing emails`),
          ),
        );
      }
    });

    it('HTTP atsakymas Resend nelaukia', async () => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const send = jest.spyOn(ctx.emails, 'send').mockImplementation(() => held);

      await placeOrder(); // 201 grįžo, nors laiškas negali būti išsiųstas, kol nepaleista
      for (let i = 0; i < 200 && send.mock.calls.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(send).toHaveBeenCalled();
      release();
      await settled();
    });

    it("vartotojo įvestis HTML laiške escape'inama", async () => {
      const customer = { ...uniqueCustomer(), name: '<script>alert(1)</script>' };
      await placeOrder({
        customer,
        fulfillment: { method: 'pickup', notes: '<img src=x onerror=alert(2)> & "kabutės"' },
      });
      const sent = await settled();
      expect(sent).toHaveLength(2);
      for (const m of sent) {
        expect(m.html).not.toContain('<script>');
        expect(m.html).not.toContain('<img src=x');
        expect(m.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(m.html).toContain('&lt;img src=x onerror=alert(2)&gt; &amp; &quot;kabutės&quot;');
        // Tekstinėje versijoje escape nereikia.
        expect(m.text).toContain('<script>alert(1)</script>');
      }
    });
  });

  describe('būsenos keitimas', () => {
    it('confirmed, ready ir cancelled: po vieną tinkamą laišką; completed: jokio', async () => {
      const order = await placeOrderQuietly();

      expect((await setStatus(order.id, 'confirmed')).status).toBe(200);
      let sent = await settled();
      expect(sent).toHaveLength(1);
      expect(sent[0]!.idempotencyKey).toBe(`order-status/${order.id}/confirmed`);
      expect(sent[0]!.subject).toBe(`Užsakymas ${order.orderNumber} patvirtintas`);
      ctx.emails.clear();

      expect((await setStatus(order.id, 'ready')).status).toBe(200);
      sent = await settled();
      expect(sent).toHaveLength(1);
      expect(sent[0]!.idempotencyKey).toBe(`order-status/${order.id}/ready`);
      expect(sent[0]!.subject).toBe(`Užsakymas ${order.orderNumber} paruoštas atsiimti`);
      expect(sent[0]!.html).toContain('Paruoštas atsiimti');
      expect(sent[0]!.html).toContain('Kovo 11-osios g. 33, Kaunas, 17:00–20:00');
      expect(sent[0]!.html).toContain(`${WEB_URL}/uzsakymas/${order.accessToken}`);
      ctx.emails.clear();

      expect((await setStatus(order.id, 'completed')).status).toBe(200);
      expect(await settled()).toHaveLength(0);
    });

    it('pending laiško neturi', async () => {
      const order = await placeOrderQuietly();
      const doc = await ctx.orderModel.findById(order.id).lean<Order>().exec();
      ctx.notifications.orderStatusChanged(doc!, 'pending');
      expect(await settled()).toHaveLength(0);
    });

    it('atšaukimas: laiškas su priežastimi ir „nieko nenuskaičiavome“', async () => {
      const order = await placeOrderQuietly();
      const res = await cancel(order.id, { reason: 'Sugedo orkaitė <b>labai</b>' });
      expect(res.status).toBe(200);

      const sent = await settled();
      expect(sent).toHaveLength(1);
      const [m] = sent;
      expect(m!.idempotencyKey).toBe(`order-status/${order.id}/cancelled`);
      expect(m!.subject).toBe(`Užsakymas ${order.orderNumber} atšauktas`);
      expect(m!.html).toContain('Sugedo orkaitė &lt;b&gt;labai&lt;/b&gt;');
      expect(m!.text).toContain('Priežastis: Sugedo orkaitė <b>labai</b>');
      expect(m!.text).toContain('Nieko nenuskaičiavome');
    });

    it('dvigubas atšaukimas (iš eilės): vienas laiškas', async () => {
      const order = await placeOrderQuietly();
      expect((await cancel(order.id)).status).toBe(200);
      expect((await cancel(order.id)).status).toBe(409);
      const sent = await settled();
      expect(sent).toHaveLength(1);
      expect(sent[0]!.text).not.toContain('Priežastis');
    });

    it('dvigubas atšaukimas (vienu metu): vienas laiškas', async () => {
      const order = await placeOrderQuietly();
      const results = await Promise.all([cancel(order.id), cancel(order.id)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await settled()).toHaveLength(1);
    });

    it('nepavykęs perėjimas (atgal) laiško nesiunčia', async () => {
      const order = await placeOrderQuietly();
      await setStatus(order.id, 'ready');
      await settled();
      ctx.emails.clear();
      expect((await setStatus(order.id, 'confirmed')).status).toBe(409);
      expect(await settled()).toHaveLength(0);
    });

    it('laiško klaida būsenos keitimo nesugadina', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const order = await placeOrderQuietly();
      ctx.emails.failWith = new Error('Resend down');

      expect((await setStatus(order.id, 'confirmed')).status).toBe(200);
      expect((await cancel(order.id, { reason: 'Nėra' })).status).toBe(200);
      await settled();
      const doc = await ctx.orderModel.findById(order.id).lean<Order>().exec();
      expect(doc!.status).toBe('cancelled');
    });
  });
});

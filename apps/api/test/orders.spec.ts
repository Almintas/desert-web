import { getShopYear } from '@desert-web/shared';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  getQuantityAvailable,
  orderBody,
  type TestContext,
} from './helpers';

describe('Užsakymai (POST /orders, GET /orders/access/:token)', () => {
  let ctx: TestContext;

  const post = (body: object) => request(ctx.app.getHttpServer()).post('/orders').send(body);

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
  });

  describe('sėkmingas užsakymas', () => {
    it('sukuria užsakymą, rezervuoja kiekį, išsaugo kopijas ir numeruoja iš eilės', async () => {
      const cake = await createProduct(ctx, {
        name: 'Medaus tortas',
        variants: [{ name: '1 kg', priceCents: 2500 }],
      });
      const cookies = await createProduct(ctx, {
        name: 'Sausainiai',
        variants: [{ name: '12 vnt.', priceCents: 900 }],
      });
      const window = await createSaleWindow(ctx, {
        items: [
          {
            productId: cake.productId,
            variantId: cake.variantIds[0]!,
            priceCents: 2200,
            quantity: 10,
          },
          {
            productId: cookies.productId,
            variantId: cookies.variantIds[0]!,
            priceCents: 750,
            quantity: 5,
          },
        ],
      });

      const res = await post(
        orderBody(window._id, [
          { variantId: cake.variantIds[0]!, quantity: 2 },
          { variantId: cookies.variantIds[0]!, quantity: 3 },
        ]),
      );

      expect(res.status).toBe(201);
      const year = getShopYear(new Date());
      const { order, accessToken } = res.body;
      expect(order.orderNumber).toBe(`DW-${year}-0001`);
      expect(order.status).toBe('pending');
      expect(order.saleWindowId).toBe(window._id.toString());
      expect(order.items).toEqual([
        {
          productId: cake.productId.toString(),
          variantId: cake.variantIds[0]!.toString(),
          productName: 'Medaus tortas',
          variantName: '1 kg',
          unitPriceCents: 2200, // lango kaina, ne bazinė 2500
          quantity: 2,
          lineTotalCents: 4400,
        },
        {
          productId: cookies.productId.toString(),
          variantId: cookies.variantIds[0]!.toString(),
          productName: 'Sausainiai',
          variantName: '12 vnt.',
          unitPriceCents: 750,
          quantity: 3,
          lineTotalCents: 2250,
        },
      ]);
      expect(order.totalCents).toBe(6650);
      expect(order.currency).toBe('EUR');
      expect(typeof accessToken).toBe('string');

      expect(await getQuantityAvailable(ctx, window._id, cake.variantIds[0]!)).toBe(8);
      expect(await getQuantityAvailable(ctx, window._id, cookies.variantIds[0]!)).toBe(2);

      // Kopijos išsaugotos DB, net jei produktas vėliau pervadinamas.
      await ctx.productModel.updateOne({ _id: cake.productId }, { name: 'Pervadintas' });
      const stored = await ctx.orderModel.findById(order.id).lean().exec();
      expect(stored?.items[0]?.productName).toBe('Medaus tortas');
      expect(stored?.items[0]?.variantName).toBe('1 kg');

      expect(order.payment).toEqual({ status: 'unpaid', method: 'on_pickup', paidAt: null });

      const view = await request(ctx.app.getHttpServer()).get(`/orders/access/${accessToken}`);
      expect(view.status).toBe(200);
      expect(view.body).toEqual({
        ...order,
        saleWindow: {
          id: window._id.toString(),
          title: 'Savaitgalio pardavimas',
          pickupLocation: null,
          pickupFrom: null,
          pickupTo: null,
        },
      });

      const second = await post(
        orderBody(window._id, [{ variantId: cake.variantIds[0]!, quantity: 1 }]),
      );
      expect(second.status).toBe(201);
      expect(second.body.order.orderNumber).toBe(`DW-${year}-0002`);
    });

    it('pristatymui išsaugo adresą', async () => {
      const p = await createProduct(ctx);
      const window = await createSaleWindow(ctx, {
        items: [{ productId: p.productId, variantId: p.variantIds[0]! }],
      });
      const res = await post(
        orderBody(window._id, [{ variantId: p.variantIds[0]!, quantity: 1 }], {
          fulfillment: { method: 'delivery', address: 'Gedimino pr. 1, Vilnius' },
        }),
      );
      expect(res.status).toBe(201);
      expect(res.body.order.fulfillment).toEqual({
        method: 'delivery',
        address: 'Gedimino pr. 1, Vilnius',
        notes: null,
      });
    });
  });

  describe('validacija', () => {
    it('netinkamas body grąžina 400 su issues', async () => {
      const res = await post({
        saleWindowId: 'ne-id',
        customer: { name: 'A', email: 'blogas', phone: 'x' },
        items: [],
        fulfillment: { method: 'delivery' },
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Netinkami duomenys');
      expect(Array.isArray(res.body.issues)).toBe(true);
      expect(res.body.issues.length).toBeGreaterThan(0);
      const paths = res.body.issues.map((i: { path: string }) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['saleWindowId', 'customer.email', 'items']));
    });
  });

  describe('pardavimo langas', () => {
    it('neegzistuojantis langas: 404 SALE_WINDOW_NOT_FOUND', async () => {
      const p = await createProduct(ctx);
      const res = await post(
        orderBody(new Types.ObjectId(), [{ variantId: p.variantIds[0]!, quantity: 1 }]),
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SALE_WINDOW_NOT_FOUND');
      expect(typeof res.body.message).toBe('string');
    });

    it.each([
      ['draft', { status: 'draft' as const }],
      ['cancelled', { status: 'cancelled' as const }],
      ['dar neprasidėjęs', { opensInMinutes: 10, closesInMinutes: 60 }],
      ['jau pasibaigęs', { opensInMinutes: -60, closesInMinutes: -1 }],
    ])('langas %s: 409 SALE_WINDOW_CLOSED', async (_label, options) => {
      const p = await createProduct(ctx);
      const window = await createSaleWindow(ctx, {
        items: [{ productId: p.productId, variantId: p.variantIds[0]!, quantity: 10 }],
        ...options,
      });
      const res = await post(orderBody(window._id, [{ variantId: p.variantIds[0]!, quantity: 1 }]));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SALE_WINDOW_CLOSED');
      expect(await getQuantityAvailable(ctx, window._id, p.variantIds[0]!)).toBe(10);
      expect(await ctx.orderModel.countDocuments()).toBe(0);
    });
  });

  describe('atsiėmimo būdas', () => {
    it('pristatymas negalimas: 400 FULFILLMENT_NOT_AVAILABLE', async () => {
      const p = await createProduct(ctx);
      const window = await createSaleWindow(ctx, {
        items: [{ productId: p.productId, variantId: p.variantIds[0]! }],
        deliveryAvailable: false,
      });
      const res = await post(
        orderBody(window._id, [{ variantId: p.variantIds[0]!, quantity: 1 }], {
          fulfillment: { method: 'delivery', address: 'Gedimino pr. 1, Vilnius' },
        }),
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('FULFILLMENT_NOT_AVAILABLE');
    });

    it('atsiėmimas negalimas: 400 FULFILLMENT_NOT_AVAILABLE', async () => {
      const p = await createProduct(ctx);
      const window = await createSaleWindow(ctx, {
        items: [{ productId: p.productId, variantId: p.variantIds[0]! }],
        pickupAvailable: false,
      });
      const res = await post(
        orderBody(window._id, [{ variantId: p.variantIds[0]!, quantity: 1 }], {
          fulfillment: { method: 'pickup' },
        }),
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('FULFILLMENT_NOT_AVAILABLE');
    });
  });

  describe('prekės ir limitai', () => {
    it('prekės nėra lange: 400 ITEM_NOT_IN_WINDOW', async () => {
      const inWindow = await createProduct(ctx);
      const other = await createProduct(ctx, { name: 'Kita' });
      const window = await createSaleWindow(ctx, {
        items: [{ productId: inWindow.productId, variantId: inWindow.variantIds[0]! }],
      });
      const res = await post(
        orderBody(window._id, [{ variantId: other.variantIds[0]!, quantity: 1 }]),
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ITEM_NOT_IN_WINDOW');
      expect(res.body.variantId).toBe(other.variantIds[0]!.toString());
    });

    it('viršytas maxPerOrder: 400 MAX_PER_ORDER_EXCEEDED', async () => {
      const p = await createProduct(ctx);
      const window = await createSaleWindow(ctx, {
        items: [
          { productId: p.productId, variantId: p.variantIds[0]!, quantity: 10, maxPerOrder: 2 },
        ],
      });
      const res = await post(orderBody(window._id, [{ variantId: p.variantIds[0]!, quantity: 3 }]));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MAX_PER_ORDER_EXCEEDED');
      expect(res.body.max).toBe(2);
      expect(await getQuantityAvailable(ctx, window._id, p.variantIds[0]!)).toBe(10);
    });

    describe('maxPerCustomer', () => {
      async function setup() {
        const p = await createProduct(ctx);
        const window = await createSaleWindow(ctx, {
          items: [
            {
              productId: p.productId,
              variantId: p.variantIds[0]!,
              quantity: 20,
              maxPerCustomer: 3,
            },
          ],
        });
        return { window, variantId: p.variantIds[0]! };
      }

      it('tas pats el. paštas, kitas telefonas: 409 su remaining', async () => {
        const { window, variantId } = await setup();
        const first = await post(
          orderBody(window._id, [{ variantId, quantity: 2 }], {
            customer: { name: 'Ona', email: 'ona@example.com', phone: '+37061111111' },
          }),
        );
        expect(first.status).toBe(201);

        const second = await post(
          orderBody(window._id, [{ variantId, quantity: 2 }], {
            customer: { name: 'Ona', email: 'ONA@Example.com', phone: '+37062222222' },
          }),
        );
        expect(second.status).toBe(409);
        expect(second.body.code).toBe('MAX_PER_CUSTOMER_EXCEEDED');
        expect(second.body.remaining).toBe(1);
        expect(second.body.max).toBe(3);
        expect(await getQuantityAvailable(ctx, window._id, variantId)).toBe(18);

        // Likutis vis dar leidžiamas.
        const third = await post(
          orderBody(window._id, [{ variantId, quantity: 1 }], {
            customer: { name: 'Ona', email: 'ona@example.com', phone: '+37063333333' },
          }),
        );
        expect(third.status).toBe(201);
      });

      it('tas pats telefonas kitu formatu, kitas el. paštas: 409 su remaining', async () => {
        const { window, variantId } = await setup();
        const first = await post(
          orderBody(window._id, [{ variantId, quantity: 3 }], {
            customer: { name: 'Jonas', email: 'jonas@example.com', phone: '8 612 34567' },
          }),
        );
        expect(first.status).toBe(201);

        const second = await post(
          orderBody(window._id, [{ variantId, quantity: 1 }], {
            customer: { name: 'Jonas', email: 'kitas@example.com', phone: '+37061234567' },
          }),
        );
        expect(second.status).toBe(409);
        expect(second.body.code).toBe('MAX_PER_CUSTOMER_EXCEEDED');
        expect(second.body.remaining).toBe(0);
      });

      it('atšauktas užsakymas į limitą neįskaičiuojamas', async () => {
        const { window, variantId } = await setup();
        const customer = { name: 'Rūta', email: 'ruta@example.com', phone: '+37064444444' };
        const first = await post(orderBody(window._id, [{ variantId, quantity: 3 }], { customer }));
        expect(first.status).toBe(201);

        await ctx.orderModel.updateOne({ _id: first.body.order.id }, { status: 'cancelled' });

        const second = await post(
          orderBody(window._id, [{ variantId, quantity: 3 }], { customer }),
        );
        expect(second.status).toBe(201);
      });

      it('el. paštas su tarpais priimamas, saugomas be tarpų ir skaičiuojamas į tą patį limitą', async () => {
        const { window, variantId } = await setup();
        const first = await post(
          orderBody(window._id, [{ variantId, quantity: 2 }], {
            customer: { name: 'Ona', email: '  ona@example.com ', phone: '+37061111111' },
          }),
        );
        expect(first.status).toBe(201);
        expect(first.body.order.customer.email).toBe('ona@example.com');
        const stored = await ctx.orderModel.findById(first.body.order.id).lean().exec();
        expect(stored?.customer.email).toBe('ona@example.com');
        expect(stored?.customer.emailNormalized).toBe('ona@example.com');

        const second = await post(
          orderBody(window._id, [{ variantId, quantity: 2 }], {
            customer: { name: 'Ona', email: 'ona@example.com', phone: '+37062222222' },
          }),
        );
        expect(second.status).toBe(409);
        expect(second.body.code).toBe('MAX_PER_CUSTOMER_EXCEEDED');
        expect(second.body.remaining).toBe(1);
      });
    });
  });

  describe('likutis', () => {
    it('nepakanka kiekio: 409 INSUFFICIENT_STOCK su items', async () => {
      const p = await createProduct(ctx);
      const window = await createSaleWindow(ctx, {
        items: [{ productId: p.productId, variantId: p.variantIds[0]!, quantity: 2 }],
      });
      const res = await post(orderBody(window._id, [{ variantId: p.variantIds[0]!, quantity: 3 }]));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.items).toEqual([
        { variantId: p.variantIds[0]!.toString(), requested: 3, available: 2 },
      ]);
    });

    it('atomiškumas: jei vienos prekės trūksta, nekeičiamas nė vienas kiekis ir užsakymas nekuriamas', async () => {
      const a = await createProduct(ctx, { name: 'A' });
      const b = await createProduct(ctx, { name: 'B' });
      const window = await createSaleWindow(ctx, {
        items: [
          { productId: a.productId, variantId: a.variantIds[0]!, quantity: 10 },
          { productId: b.productId, variantId: b.variantIds[0]!, quantity: 1 },
        ],
      });
      const res = await post(
        orderBody(window._id, [
          { variantId: a.variantIds[0]!, quantity: 2 },
          { variantId: b.variantIds[0]!, quantity: 2 },
        ]),
      );
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.items).toEqual([
        { variantId: b.variantIds[0]!.toString(), requested: 2, available: 1 },
      ]);
      expect(await getQuantityAvailable(ctx, window._id, a.variantIds[0]!)).toBe(10);
      expect(await getQuantityAvailable(ctx, window._id, b.variantIds[0]!)).toBe(1);
      expect(await ctx.orderModel.countDocuments()).toBe(0);
      expect(await ctx.counterModel.countDocuments()).toBe(0);
    });
  });

  describe('GET /orders/access/:accessToken', () => {
    it('netinkamo formato token: 404', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/orders/access/ne-tokenas');
      expect(res.status).toBe(404);
    });

    it('nežinomas token: 404', async () => {
      const res = await request(ctx.app.getHttpServer()).get(`/orders/access/${'A'.repeat(32)}`);
      expect(res.status).toBe(404);
    });
  });
});

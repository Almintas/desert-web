import { DEFAULT_SHOP_INFO, type ShopInfo } from '@desert-web/shared';
import request from 'supertest';
import { clearDatabase, createTestContext, loginAdmin, type TestContext } from './helpers';

const SAVED: ShopInfo = {
  seller: {
    name: 'UAB Saldainis',
    businessId: '305123456',
    address: 'Laisvės al. 1, Kaunas',
    email: 'labas@saldainis.example',
    phone: '+370 611 22222',
  },
  social: {
    facebook: 'https://facebook.com/saldainis',
    instagram: 'https://www.instagram.com/saldainis/',
    tiktok: '',
  },
  texts: { tagline: 'Saldžiausi Kaune.', subtagline: '' },
};

/** SAVED su pakeistu vienu lauku (pvz., ['social', 'tiktok']). */
function withField(group: keyof ShopInfo, field: string, value: string): ShopInfo {
  return { ...SAVED, [group]: { ...SAVED[group], [field]: value } };
}

describe('Parduotuvės informacija (nustatymai ir GET /shop-info)', () => {
  let ctx: TestContext;
  let owner: string;
  const http = () => request(ctx.app.getHttpServer());
  const putShop = (shop: unknown, token = owner) =>
    http().put('/admin/settings').set('Authorization', `Bearer ${token}`).send({ shop });
  const issuePaths = (res: request.Response) =>
    (res.body.issues as { path: string }[]).map((i) => i.path);

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    owner = await loginAdmin(ctx, 'owner');
  });

  describe('GET /shop-info (viešas)', () => {
    it('be dokumento: numatytosios reikšmės (dabartiniai tekstai iš kodo), be autentifikacijos', async () => {
      const res = await http().get('/shop-info');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(DEFAULT_SHOP_INFO);
      // Tik skaito: dokumento nesukuria.
      expect(await ctx.connection.db!.collection('settings').countDocuments()).toBe(0);
    });

    it('tik vieši laukai (be specialių užsakymų nustatymų ir laikų)', async () => {
      expect((await putShop(SAVED)).status).toBe(200);
      const res = await http().get('/shop-info');
      expect(res.body).toEqual(SAVED);
      expect(Object.keys(res.body).sort()).toEqual(['seller', 'social', 'texts']);
    });

    it('trūkstami saugomi laukai pakeičiami numatytaisiais, tuščia eilutė lieka tuščia', async () => {
      await ctx.connection
        .db!.collection<{ _id: string; shop?: unknown }>('settings')
        .insertOne({ _id: 'global', shop: { seller: { name: 'Ona', phone: '' } } });
      const res = await http().get('/shop-info');
      expect(res.body.seller).toEqual({ ...DEFAULT_SHOP_INFO.seller, name: 'Ona', phone: '' });
      expect(res.body.social).toEqual(DEFAULT_SHOP_INFO.social);
      expect(res.body.texts).toEqual(DEFAULT_SHOP_INFO.texts);
    });
  });

  describe('PUT /admin/settings { shop }', () => {
    it('keisti gali tik owner; staff mato (GET), bet gauna 403', async () => {
      const staff = await loginAdmin(ctx, 'staff');
      expect((await putShop(SAVED, staff)).status).toBe(403);
      expect((await http().put('/admin/settings').send({ shop: SAVED })).status).toBe(401);
      const view = await http().get('/admin/settings').set('Authorization', `Bearer ${staff}`);
      expect(view.status).toBe(200);
      expect(view.body.shop).toEqual(DEFAULT_SHOP_INFO);
      expect((await http().get('/shop-info')).body).toEqual(DEFAULT_SHOP_INFO);
    });

    it('owner išsaugo (reikšmės apkarpomos); specialių užsakymų nustatymai nekeičiami', async () => {
      const padded = {
        ...SAVED,
        seller: { ...SAVED.seller, name: '  UAB Saldainis  ', email: ' labas@saldainis.example ' },
      };
      const res = await putShop(padded);
      expect(res.status).toBe(200);
      expect(res.body.shop).toEqual(SAVED);
      expect(res.body.specialOrders).toEqual({ enabled: false, leadTimeDays: 7, maxDaysAhead: 90 });

      // Vėliau keičiant tik specialius užsakymus parduotuvės informacija lieka.
      const special = await http()
        .put('/admin/settings')
        .set('Authorization', `Bearer ${owner}`)
        .send({ specialOrders: { enabled: true, leadTimeDays: 1, maxDaysAhead: 10 } });
      expect(special.status).toBe(200);
      expect(special.body.shop).toEqual(SAVED);
      expect((await http().get('/shop-info')).body).toEqual(SAVED);
    });

    it('tušti body: 400', async () => {
      const res = await http()
        .put('/admin/settings')
        .set('Authorization', `Bearer ${owner}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it.each([
      ['facebook', 'https://facebook.com/saldainis'],
      ['facebook', 'https://www.facebook.com/profile.php?id=123'],
      ['instagram', 'https://instagram.com/saldainis'],
      ['tiktok', 'https://www.tiktok.com/@saldainis'],
      ['tiktok', ''],
    ])('tinkamas %s adresas: %s', async (network, url) => {
      const res = await putShop(withField('social', network, url));
      expect(res.status).toBe(200);
      expect(res.body.shop.social[network]).toBe(url);
    });

    it.each([
      ['facebook', 'http://facebook.com/saldainis'], // ne https
      ['facebook', 'https://facebook.com.evil.example/x'],
      ['facebook', 'https://evilfacebook.com/x'],
      ['facebook', 'https://m.facebook.com/x'],
      ['instagram', 'https://www.facebook.com/saldainis'], // kito tinklo domenas
      ['instagram', 'javascript:alert(1)'],
      ['tiktok', 'tiktok.com/@saldainis'], // be schemos
      ['tiktok', 'https://user:pass@tiktok.com/@x'],
      ['facebook', `https://facebook.com/${'a'.repeat(300)}`],
    ])('netinkamas %s adresas: %s', async (network, url) => {
      const res = await putShop(withField('social', network, url));
      expect(res.status).toBe(400);
      expect(issuePaths(res)).toContain(`shop.social.${network}`);
    });

    it.each(['ona', 'ona@', '@example.com', 'ona@example', 'ona example@x.lt'])(
      'netinkamas el. paštas: %s',
      async (email) => {
        const res = await putShop(withField('seller', 'email', email));
        expect(res.status).toBe(400);
        expect(issuePaths(res)).toContain('shop.seller.email');
      },
    );

    it.each(['', 'ona@example.com', 'Ona.Onaite+parduotuve@pastas.lt'])(
      'tinkamas el. paštas: „%s“',
      async (email) => {
        expect((await putShop(withField('seller', 'email', email))).status).toBe(200);
      },
    );

    it.each([
      ['+370 600 12345', 200],
      ['860012345', 200],
      ['', 200],
      ['+370-600-12345', 400],
      ['tel. 860012345', 400],
      ['12345', 400], // per mažai skaitmenų
      ['370+60012345', 400],
    ])('telefonas „%s“: %i', async (phone, status) => {
      const res = await putShop(withField('seller', 'phone', phone));
      expect(res.status).toBe(status);
      if (status === 400) expect(issuePaths(res)).toContain('shop.seller.phone');
    });

    it('per ilgi tekstai ir trūkstami laukai: 400', async () => {
      const long = await putShop(withField('texts', 'tagline', 'x'.repeat(121)));
      expect(issuePaths(long)).toContain('shop.texts.tagline');
      const missing = await putShop({ seller: SAVED.seller, social: SAVED.social });
      expect(missing.status).toBe(400);
      expect(issuePaths(missing)).toContain('shop.texts');
    });
  });
});

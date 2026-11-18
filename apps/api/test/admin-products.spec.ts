import type { AdminProductInput, AdminRole, ProductDto } from '@desert-web/shared';
import { Types } from 'mongoose';
import request from 'supertest';
import { AdminAccountsService } from '../src/admin-auth/admin-accounts.service';
import { clearDatabase, createSaleWindow, createTestContext, type TestContext } from './helpers';

const PASSWORD = 'teisingas-slaptazodis';

function productBody(overrides: Partial<AdminProductInput> = {}): AdminProductInput {
  return {
    name: 'Šokoladinis tortas',
    slug: 'sokoladinis-tortas',
    description: 'Su juoduoju šokoladu',
    category: 'Tortai',
    allergens: ['pienas', 'kiaušiniai'],
    variants: [
      { name: '1 kg', priceCents: 2500 },
      { name: '2 kg', priceCents: 4800 },
    ],
    specialOrder: { enabled: true, minQuantity: 3 },
    isActive: true,
    ...overrides,
  };
}

/** Body PUT užklausai iš esamo produkto (su variantų id). */
function bodyFrom(p: ProductDto, overrides: Partial<AdminProductInput> = {}): AdminProductInput {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description,
    category: p.category,
    allergens: p.allergens,
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, priceCents: v.priceCents })),
    specialOrder: p.specialOrder,
    isActive: p.isActive,
    ...overrides,
  };
}

describe('Admin produktai (/admin/products)', () => {
  let ctx: TestContext;
  let token: string;
  let ipSeq = 0;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const list = () => auth(http().get('/admin/products'));
  const getOne = (id: string) => auth(http().get(`/admin/products/${id}`));
  const create = (body: object) => auth(http().post('/admin/products').send(body));
  const update = (id: string, body: object) => auth(http().put(`/admin/products/${id}`).send(body));

  async function loginAs(role: AdminRole, email = `${role}@example.com`): Promise<string> {
    await ctx.app.get(AdminAccountsService).create(email, role, PASSWORD);
    ipSeq += 1;
    const res = await http()
      .post('/admin/auth/login')
      .set('X-Forwarded-For', `10.1.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`)
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  async function createOk(overrides: Partial<AdminProductInput> = {}): Promise<ProductDto> {
    const res = await create(productBody(overrides));
    expect(res.status).toBe(201);
    return res.body as ProductDto;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    token = await loginAs('owner');
  });

  describe('autentifikacija', () => {
    const id = new Types.ObjectId().toString();
    it.each([
      ['GET', '/admin/products'],
      ['GET', `/admin/products/${id}`],
      ['POST', '/admin/products'],
      ['PUT', `/admin/products/${id}`],
    ])('%s %s be tokeno: 401', async (method, path) => {
      const req =
        method === 'GET'
          ? http().get(path)
          : method === 'POST'
            ? http().post(path).send(productBody())
            : http().put(path).send(productBody());
      const res = await req;
      expect(res.status).toBe(401);
    });

    it('staff rolė taip pat gali valdyti produktus', async () => {
      token = await loginAs('staff');
      const created = await createOk();
      expect((await list()).status).toBe(200);
      expect((await update(created.id, bodyFrom(created, { name: 'Kitas' }))).status).toBe(200);
    });
  });

  describe('POST /admin/products', () => {
    it('sukuria produktą: 201 su ProductDto', async () => {
      const res = await create(productBody());

      expect(res.status).toBe(201);
      const dto = res.body as ProductDto;
      expect(dto).toMatchObject({
        name: 'Šokoladinis tortas',
        slug: 'sokoladinis-tortas',
        description: 'Su juoduoju šokoladu',
        category: 'Tortai',
        images: [],
        allergens: ['pienas', 'kiaušiniai'],
        specialOrder: { enabled: true, minQuantity: 3 },
        isActive: true,
      });
      expect(dto.id).toMatch(/^[a-f\d]{24}$/);
      expect(dto.variants.map((v) => [v.name, v.priceCents])).toEqual([
        ['1 kg', 2500],
        ['2 kg', 4800],
      ]);
      expect(dto.variants.every((v) => /^[a-f\d]{24}$/.test(v.id))).toBe(true);
      expect(typeof dto.createdAt).toBe('string');

      expect((await getOne(dto.id)).body).toEqual(dto);
    });

    it('netinkami duomenys: 400 su issues', async () => {
      const res = await create({
        ...productBody(),
        name: '',
        slug: 'Ne Slug',
        variants: [{ name: '1 kg', priceCents: 12.5 }],
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Netinkami duomenys');
      const paths = (res.body.issues as { path: string }[]).map((i) => i.path).sort();
      expect(paths).toEqual(['name', 'slug', 'variants.0.priceCents']);
    });

    it('be variantų: 400', async () => {
      const res = await create(productBody({ variants: [] }));
      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual([
        { path: 'variants', message: 'Reikia bent vieno varianto' },
      ]);
    });

    it('images įvestyje ignoruojamas', async () => {
      const res = await create({
        ...productBody(),
        images: [{ url: 'https://example.com/a.jpg', publicId: 'a' }],
      });
      expect(res.status).toBe(201);
      expect(res.body.images).toEqual([]);
    });

    it('pasikartojantis slug: 409 SLUG_TAKEN', async () => {
      await createOk();
      const res = await create(productBody({ name: 'Kitas tortas' }));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLUG_TAKEN');
      expect(res.body.message).toMatch(/jau naudojamas/);
    });

    it('lygiagretūs kūrimai su tuo pačiu slug: vienas 201, kiti 409 SLUG_TAKEN (E11000)', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => create(productBody({ name: `Tortas ${i}` }))),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      for (const r of results.filter((r) => r.status === 409)) {
        expect(r.body.code).toBe('SLUG_TAKEN');
      }
    });

    it('variantas su id kuriant: 400 VARIANT_NOT_FOUND', async () => {
      const id = new Types.ObjectId().toString();
      const res = await create(productBody({ variants: [{ id, name: '1 kg', priceCents: 100 }] }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VARIANT_NOT_FOUND');
      expect(res.body.variantIds).toEqual([id]);
    });
  });

  describe('GET /admin/products', () => {
    it('visi produktai, ir archyvuoti, pagal pavadinimą', async () => {
      await createOk({ name: 'Žemuogių pyragas', slug: 'zemuogiu-pyragas' });
      await createOk({ name: 'Šokoladinis tortas', slug: 'sokoladinis-tortas', isActive: false });
      await createOk({ name: 'Medaus tortas', slug: 'medaus-tortas' });
      await createOk({ name: 'Sūrio pyragas', slug: 'surio-pyragas' });

      const res = await list();
      expect(res.status).toBe(200);
      // Lietuviška abėcėlė: S < Š < Z < Ž.
      expect((res.body as ProductDto[]).map((p) => p.name)).toEqual([
        'Medaus tortas',
        'Sūrio pyragas',
        'Šokoladinis tortas',
        'Žemuogių pyragas',
      ]);
    });

    it('GET /:id: nežinomas arba netinkamas id: 404', async () => {
      const missing = await getOne(new Types.ObjectId().toString());
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('PRODUCT_NOT_FOUND');
      expect((await getOne('ne-id')).status).toBe(404);
    });
  });

  describe('PUT /admin/products/:id', () => {
    it('atnaujina laukus, esamų variantų _id išlieka, naujas variantas gauna naują id', async () => {
      const created = await createOk();
      const [small, large] = created.variants;

      const res = await update(
        created.id,
        bodyFrom(created, {
          name: 'Juodojo šokolado tortas',
          slug: 'juodojo-sokolado-tortas',
          allergens: ['pienas'],
          isActive: false,
          variants: [
            { id: large!.id, name: '2 kg', priceCents: 5000 },
            { id: small!.id, name: '1 kg (mažas)', priceCents: 2600 },
            { name: '3 kg', priceCents: 7000 },
          ],
        }),
      );

      expect(res.status).toBe(200);
      const dto = res.body as ProductDto;
      expect(dto).toMatchObject({
        id: created.id,
        name: 'Juodojo šokolado tortas',
        slug: 'juodojo-sokolado-tortas',
        allergens: ['pienas'],
        isActive: false,
      });
      expect(dto.variants).toHaveLength(3);
      expect(dto.variants[0]).toEqual({ id: large!.id, name: '2 kg', priceCents: 5000 });
      expect(dto.variants[1]).toEqual({ id: small!.id, name: '1 kg (mažas)', priceCents: 2600 });
      expect(dto.variants[2]!.id).toMatch(/^[a-f\d]{24}$/);
      expect([small!.id, large!.id]).not.toContain(dto.variants[2]!.id);

      const stored = await ctx.productModel.findById(created.id).lean().exec();
      expect(stored!.variants.map((v) => v._id.toString())).toEqual(dto.variants.map((v) => v.id));
    });

    it('svetimo varianto id: 400 VARIANT_NOT_FOUND, niekas nepakeičiama', async () => {
      const created = await createOk();
      const other = await createOk({ name: 'Kitas', slug: 'kitas' });
      const foreignId = other.variants[0]!.id;

      const res = await update(
        created.id,
        bodyFrom(created, {
          name: 'Pakeistas',
          variants: [{ id: foreignId, name: 'Svetimas', priceCents: 100 }],
        }),
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VARIANT_NOT_FOUND');
      expect(res.body.variantIds).toEqual([foreignId]);
      expect((await getOne(created.id)).body).toEqual(created);
    });

    it('pasikartojantis varianto id: 400', async () => {
      const created = await createOk();
      const id = created.variants[0]!.id;
      const res = await update(
        created.id,
        bodyFrom(created, {
          variants: [
            { id, name: 'a', priceCents: 1 },
            { id, name: 'b', priceCents: 2 },
          ],
        }),
      );
      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual([
        { path: 'variants.1.id', message: 'Tas pats variantas kartojasi' },
      ]);
    });

    it('slug, užimtas kito produkto: 409 SLUG_TAKEN; savo slug palikti galima', async () => {
      const first = await createOk();
      const second = await createOk({ name: 'Kitas', slug: 'kitas' });

      const taken = await update(second.id, bodyFrom(second, { slug: first.slug }));
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe('SLUG_TAKEN');

      const same = await update(first.id, bodyFrom(first, { name: 'Tas pats slug' }));
      expect(same.status).toBe(200);
    });

    it('nežinomas produktas: 404', async () => {
      const res = await update(new Types.ObjectId().toString(), productBody());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('nuotraukų (images) nepakeičia', async () => {
      const created = await createOk();
      const images = [
        { url: 'https://res.cloudinary.com/demo/a.jpg', publicId: 'desert/a' },
        { url: 'https://res.cloudinary.com/demo/b.jpg', publicId: 'desert/b' },
      ];
      await ctx.productModel.updateOne({ _id: created.id }, { $set: { images } });

      const res = await update(created.id, {
        ...bodyFrom(created, { name: 'Naujas pavadinimas' }),
        images: [],
      });

      expect(res.status).toBe(200);
      expect(res.body.images).toEqual(images);
      const stored = await ctx.productModel.findById(created.id).lean().exec();
      expect(stored!.images).toEqual(images);
      expect(stored!.name).toBe('Naujas pavadinimas');
    });

    describe('varianto šalinimas, kai jį naudoja pardavimo langas', () => {
      async function setup(window: {
        status: 'draft' | 'published' | 'cancelled';
        opensInMinutes: number;
        closesInMinutes: number;
      }) {
        const created = await createOk();
        const [kept, removed] = created.variants;
        const saleWindow = await createSaleWindow(ctx, {
          ...window,
          items: [
            {
              productId: new Types.ObjectId(created.id),
              variantId: new Types.ObjectId(removed!.id),
            },
          ],
        });
        const body = bodyFrom(created, {
          variants: [{ id: kept!.id, name: kept!.name, priceCents: kept!.priceCents }],
        });
        return { created, removed: removed!, saleWindow, res: await update(created.id, body) };
      }

      async function expectInUse(r: Awaited<ReturnType<typeof setup>>) {
        expect(r.res.status).toBe(409);
        expect(r.res.body).toMatchObject({
          code: 'VARIANT_IN_USE',
          variantIds: [r.removed.id],
          saleWindows: [{ id: r.saleWindow._id.toString(), title: r.saleWindow.title }],
        });
        expect(r.res.body.message).toMatch(/pašalinti negalima/);
        // Niekas nepakeista.
        expect((await getOne(r.created.id)).body.variants).toHaveLength(2);
      }

      async function expectRemoved(r: Awaited<ReturnType<typeof setup>>) {
        expect(r.res.status).toBe(200);
        expect((r.res.body as ProductDto).variants.map((v) => v.id)).toEqual([
          r.created.variants[0]!.id,
        ]);
      }

      it('juodraštinis langas (net jei jo laikas praėjęs): 409 VARIANT_IN_USE', async () => {
        await expectInUse(
          await setup({ status: 'draft', opensInMinutes: -120, closesInMinutes: -60 }),
        );
      });

      it('paskelbtas būsimas langas: 409 VARIANT_IN_USE', async () => {
        await expectInUse(
          await setup({ status: 'published', opensInMinutes: 60, closesInMinutes: 120 }),
        );
      });

      it('paskelbtas šiuo metu atidarytas langas: 409 VARIANT_IN_USE', async () => {
        await expectInUse(
          await setup({ status: 'published', opensInMinutes: -60, closesInMinutes: 60 }),
        );
      });

      it('pasibaigęs langas: variantas pašalinamas', async () => {
        await expectRemoved(
          await setup({ status: 'published', opensInMinutes: -120, closesInMinutes: -60 }),
        );
      });

      it('atšauktas būsimas langas: variantas pašalinamas', async () => {
        await expectRemoved(
          await setup({ status: 'cancelled', opensInMinutes: 60, closesInMinutes: 120 }),
        );
      });

      it('lange naudojamą variantą galima keisti (kaina, pavadinimas), lango kaina nesikeičia', async () => {
        const created = await createOk();
        const variant = created.variants[0]!;
        const saleWindow = await createSaleWindow(ctx, {
          status: 'published',
          items: [
            {
              productId: new Types.ObjectId(created.id),
              variantId: new Types.ObjectId(variant.id),
              priceCents: 2000,
            },
          ],
        });

        const res = await update(
          created.id,
          bodyFrom(created, {
            variants: created.variants.map((v) => ({ ...v, priceCents: v.priceCents + 500 })),
          }),
        );

        expect(res.status).toBe(200);
        const stored = await ctx.saleWindowModel.findById(saleWindow._id).lean().exec();
        expect(stored!.items[0]!.priceCents).toBe(2000);
      });
    });
  });

  describe('archyvuoti produktai viešuose endpointuose', () => {
    it('nerodomi GET /products ir GET /products/:slug, bet rodomi GET /admin/products', async () => {
      const visible = await createOk({ name: 'Matomas', slug: 'matomas' });
      const archived = await createOk({ name: 'Archyvuotas', slug: 'archyvuotas' });
      const archive = await update(archived.id, bodyFrom(archived, { isActive: false }));
      expect(archive.status).toBe(200);

      const publicList = await http().get('/products');
      expect(publicList.status).toBe(200);
      expect((publicList.body as ProductDto[]).map((p) => p.id)).toEqual([visible.id]);

      expect((await http().get('/products/matomas')).status).toBe(200);
      expect((await http().get('/products/archyvuotas')).status).toBe(404);

      const adminList = await list();
      expect((adminList.body as ProductDto[]).map((p) => [p.name, p.isActive])).toEqual([
        ['Archyvuotas', false],
        ['Matomas', true],
      ]);
    });
  });
});

import { TEST_CLOUDINARY } from './cloudinary-test-env';
import type {
  AdminProductDto,
  CurrentSaleWindowResponse,
  ProductDto,
  ProductImageUploadSignatureDto,
} from '@desert-web/shared';
import { v2 as cloudinary } from 'cloudinary';
import { Types } from 'mongoose';
import request from 'supertest';
import { cloudinaryResponseSignature } from '../src/product-images/cloudinary-signature';
import type { Product } from '../src/products/product.schema';
import {
  clearDatabase,
  createProduct,
  createSaleWindow,
  createTestContext,
  loginAdmin,
  type ProductFixture,
  type TestContext,
} from './helpers';

let uploadSeq = 0;

/** Cloudinary įkėlimo atsakymas, pasirašytas testine paslaptimi (kaip tai daro Cloudinary). */
function uploadResponse(
  overrides: { publicId?: string; secret?: string; cloudName?: string; format?: string } = {},
) {
  uploadSeq += 1;
  const publicId = overrides.publicId ?? `${TEST_CLOUDINARY.folder}/foto-${uploadSeq}`;
  const version = 1700000000 + uploadSeq;
  const format = overrides.format ?? 'jpg';
  return {
    publicId,
    version,
    signature: cloudinaryResponseSignature(
      publicId,
      version,
      overrides.secret ?? TEST_CLOUDINARY.apiSecret,
    ),
    width: 1600,
    height: 1200,
    format,
    bytes: 345678,
    secureUrl: `https://res.cloudinary.com/${overrides.cloudName ?? TEST_CLOUDINARY.cloudName}/image/upload/v${version}/${publicId}.${format}`,
  };
}

describe('Produktų nuotraukos (Cloudinary)', () => {
  let ctx: TestContext;
  let token: string;
  let product: ProductFixture;
  let destroy: jest.SpyInstance;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const images = (productId: Types.ObjectId | string = product.productId) =>
    `/admin/products/${productId.toString()}/images`;
  const attach = (body: object, productId?: Types.ObjectId | string) =>
    auth(http().post(images(productId)).send(body));
  const remove = (imageId: string) => auth(http().delete(`${images()}/${imageId}`));
  const reorder = (imageIds: string[]) => auth(http().put(`${images()}/order`).send({ imageIds }));

  async function attachOk(n = 1): Promise<AdminProductDto> {
    let dto: AdminProductDto | undefined;
    for (let i = 0; i < n; i += 1) {
      const res = await attach(uploadResponse());
      expect(res.status).toBe(201);
      dto = res.body as AdminProductDto;
    }
    return dto!;
  }

  async function storedImages(productId = product.productId) {
    const p = await ctx.productModel.findById(productId).lean<Product>().exec();
    return p!.images;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    token = await loginAdmin(ctx);
    product = await createProduct(ctx, { name: 'Medaus tortas' });
    // Jokių tikrų Cloudinary kvietimų.
    destroy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('autentifikacija', () => {
    const id = new Types.ObjectId().toString();
    it.each([
      ['POST', '/admin/uploads/product-image-signature'],
      ['POST', `/admin/products/${id}/images`],
      ['PUT', `/admin/products/${id}/images/order`],
      ['DELETE', `/admin/products/${id}/images/${id}`],
    ])('%s %s be tokeno: 401', async (method, path) => {
      const req =
        method === 'POST'
          ? http().post(path).send({})
          : method === 'PUT'
            ? http().put(path).send({ imageIds: [] })
            : http().delete(path);
      expect((await req).status).toBe(401);
    });
  });

  describe('POST /admin/uploads/product-image-signature', () => {
    it.each(['owner', 'staff'] as const)(
      '%s: pasirašyti parametrai, kuriuos patikrintų Cloudinary',
      async (role) => {
        token = await loginAdmin(ctx, role);
        const before = Math.floor(Date.now() / 1000);
        const res = await auth(http().post('/admin/uploads/product-image-signature'));

        expect(res.status).toBe(200);
        const dto = res.body as ProductImageUploadSignatureDto;
        expect(dto).toEqual({
          cloudName: TEST_CLOUDINARY.cloudName,
          apiKey: TEST_CLOUDINARY.apiKey,
          uploadUrl: `https://api.cloudinary.com/v1_1/${TEST_CLOUDINARY.cloudName}/image/upload`,
          timestamp: expect.any(Number),
          signature: expect.stringMatching(/^[a-f0-9]{40}$/),
          folder: 'desert-web/test/products',
          allowedFormats: 'jpg,jpeg,png,webp,heic,heif',
          transformation: 'c_limit,h_2000,w_2000',
        });
        expect(dto.timestamp).toBeGreaterThanOrEqual(before);
        expect(dto.timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
        expect(JSON.stringify(dto)).not.toContain(TEST_CLOUDINARY.apiSecret);
        expect(
          cloudinary.utils.api_sign_request(
            {
              folder: dto.folder,
              timestamp: dto.timestamp,
              allowed_formats: dto.allowedFormats,
              transformation: dto.transformation,
            },
            TEST_CLOUDINARY.apiSecret,
          ),
        ).toBe(dto.signature);
      },
    );
  });

  describe('POST /admin/products/:id/images', () => {
    it('priima teisingai pasirašytą atsakymą: 201 su produktu', async () => {
      const upload = uploadResponse({ format: 'heic' });
      const res = await attach(upload);

      expect(res.status).toBe(201);
      const dto = res.body as AdminProductDto;
      expect(dto.id).toBe(product.productId.toString());
      expect(dto.images).toEqual([
        {
          id: expect.stringMatching(/^[a-f0-9]{24}$/),
          publicId: upload.publicId,
          version: upload.version,
          url: upload.secureUrl,
          width: 1600,
          height: 1200,
          format: 'heic',
          bytes: 345678,
          createdAt: expect.any(String),
        },
      ]);
      const stored = await storedImages();
      expect(stored).toHaveLength(1);
      expect(stored[0]!._id.toString()).toBe(dto.images[0]!.id);
    });

    it('naujos nuotraukos pridedamos gale (pirmoji lieka pagrindinė)', async () => {
      const first = await attachOk();
      const second = await attachOk();
      expect(second.images.map((i) => i.id)).toEqual([first.images[0]!.id, second.images[1]!.id]);
    });

    it('archyvuotam produktui taip pat galima', async () => {
      await ctx.productModel.updateOne({ _id: product.productId }, { isActive: false });
      expect((await attach(uploadResponse())).status).toBe(201);
    });

    it.each([
      ['kita paslaptis', { secret: 'netikra-paslaptis' }],
      ['pakeistas publicId', {}],
    ])('neteisingas parašas (%s): 400 INVALID_UPLOAD_SIGNATURE', async (name, overrides) => {
      const upload = uploadResponse(overrides);
      if (name === 'pakeistas publicId') {
        upload.publicId = `${TEST_CLOUDINARY.folder}/kitas`;
        upload.secureUrl = upload.secureUrl.replace(/foto-\d+/, 'kitas');
      }
      const res = await attach(upload);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_UPLOAD_SIGNATURE');
      expect(await storedImages()).toHaveLength(0);
    });

    it.each([
      'desert-web/production/products/foto',
      'kitas-katalogas/foto',
      'desert-web/test/products-kiti/foto',
      'desert-web/test/products/../kitas/foto',
    ])(
      'svetimas katalogas (%s), net teisingai pasirašytas: 400 FOREIGN_IMAGE',
      async (publicId) => {
        const res = await attach(uploadResponse({ publicId }));
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('FOREIGN_IMAGE');
      },
    );

    it('svetimos paskyros URL: 400 FOREIGN_IMAGE', async () => {
      const res = await attach(uploadResponse({ cloudName: 'kita-paskyra' }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('FOREIGN_IMAGE');
    });

    it.each([
      ['kitas hostas', (u: string) => u.replace('res.cloudinary.com', 'evil.example.com')],
      ['kita versija', (u: string) => u.replace(/\/v\d+\//, '/v1/')],
      ['su transformacija', (u: string) => u.replace('/upload/', '/upload/e_blur/')],
      ['kitas plėtinys', (u: string) => u.replace(/\.jpg$/, '.png')],
    ])('URL neatitinka atsakymo (%s): 400 FOREIGN_IMAGE', async (_name, mutate) => {
      const upload = uploadResponse();
      const res = await attach({ ...upload, secureUrl: mutate(upload.secureUrl) });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('FOREIGN_IMAGE');
    });

    it('ta pati nuotrauka antrą kartą: 409 DUPLICATE_IMAGE', async () => {
      const upload = uploadResponse();
      expect((await attach(upload)).status).toBe(201);
      const res = await attach(upload);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DUPLICATE_IMAGE');
      expect(await storedImages()).toHaveLength(1);
    });

    it('ta pati nuotrauka kitam produktui: 409 DUPLICATE_IMAGE', async () => {
      const other = await createProduct(ctx, { name: 'Kitas' });
      const upload = uploadResponse();
      expect((await attach(upload)).status).toBe(201);
      const res = await attach(upload, other.productId);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DUPLICATE_IMAGE');
    });

    it('nežinomas produktas: 404 PRODUCT_NOT_FOUND', async () => {
      const res = await attach(uploadResponse(), new Types.ObjectId());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('netinkamas body: 400 su issues', async () => {
      const res = await attach({ ...uploadResponse(), format: 'gif', version: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual([
        'format',
        'version',
      ]);
    });

    it('daugiausia 8: devinta atmetama su 409 IMAGE_LIMIT_REACHED', async () => {
      await attachOk(8);
      const res = await attach(uploadResponse());
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IMAGE_LIMIT_REACHED');
      expect(await storedImages()).toHaveLength(8);
    });

    it('turint 7, du lygiagretūs pridėjimai: laimi lygiai vienas', async () => {
      for (let round = 0; round < 5; round += 1) {
        await ctx.productModel.updateOne({ _id: product.productId }, { $set: { images: [] } });
        await attachOk(7);

        const results = await Promise.all([attach(uploadResponse()), attach(uploadResponse())]);

        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(results.find((r) => r.status === 409)!.body.code).toBe('IMAGE_LIMIT_REACHED');
        expect(await storedImages()).toHaveLength(8);
      }
    });
  });

  describe('DELETE /admin/products/:id/images/:imageId', () => {
    it('pašalina ir tik po commit ištrina iš Cloudinary', async () => {
      const dto = await attachOk(3);
      const [first, second, third] = dto.images;
      let committedWhenDestroyed: boolean | undefined;
      destroy.mockImplementation(async () => {
        // Skaitom ne transakcijoje: jei commit dar neįvyko, nuotrauka dar matoma.
        const stored = await storedImages();
        committedWhenDestroyed = !stored.some((i) => i._id.toString() === second!.id);
        return { result: 'ok' };
      });

      const res = await remove(second!.id);

      expect(res.status).toBe(200);
      expect((res.body as AdminProductDto).images.map((i) => i.id)).toEqual([first!.id, third!.id]);
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledWith(
        second!.publicId,
        expect.objectContaining({
          invalidate: true,
          resource_type: 'image',
          cloud_name: TEST_CLOUDINARY.cloudName,
          api_key: TEST_CLOUDINARY.apiKey,
        }),
      );
      expect(committedWhenDestroyed).toBe(true);
    });

    it('Cloudinary klaida: vis tiek 200, nuotrauka pašalinta iš DB', async () => {
      const dto = await attachOk(2);
      destroy.mockRejectedValue(new Error('Cloudinary nepasiekiamas'));

      const res = await remove(dto.images[0]!.id);

      expect(res.status).toBe(200);
      expect((res.body as AdminProductDto).images.map((i) => i.id)).toEqual([dto.images[1]!.id]);
      expect(await storedImages()).toHaveLength(1);
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('nežinoma nuotrauka: 404 IMAGE_NOT_FOUND, Cloudinary nekviečiamas', async () => {
      await attachOk();
      const res = await remove(new Types.ObjectId().toString());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('IMAGE_NOT_FOUND');
      expect(destroy).not.toHaveBeenCalled();
    });

    it('nuotrauka priklauso kitam produktui: 404 IMAGE_NOT_FOUND', async () => {
      const other = await createProduct(ctx, { name: 'Kitas' });
      const res = await attach(uploadResponse(), other.productId);
      const foreignId = (res.body as AdminProductDto).images[0]!.id;
      const removed = await remove(foreignId);
      expect(removed.status).toBe(404);
      expect(await storedImages(other.productId)).toHaveLength(1);
    });

    it('po šalinimo vėl galima pridėti iki 8', async () => {
      const dto = await attachOk(8);
      expect((await remove(dto.images[3]!.id)).status).toBe(200);
      expect((await attach(uploadResponse())).status).toBe(201);
    });
  });

  describe('PUT /admin/products/:id/images/order', () => {
    it('pakeičia tvarką (pirmoji tampa pagrindine)', async () => {
      const dto = await attachOk(3);
      const ids = dto.images.map((i) => i.id);
      const res = await reorder([ids[2]!, ids[0]!, ids[1]!]);
      expect(res.status).toBe(200);
      expect((res.body as AdminProductDto).images.map((i) => i.id)).toEqual([
        ids[2],
        ids[0],
        ids[1],
      ]);
      expect((await storedImages()).map((i) => i._id.toString())).toEqual([ids[2], ids[0], ids[1]]);
    });

    it.each([
      ['trūksta vienos', (ids: string[]) => ids.slice(1)],
      ['viena svetima', (ids: string[]) => [...ids.slice(1), new Types.ObjectId().toString()]],
      ['papildoma', (ids: string[]) => [...ids, new Types.ObjectId().toString()]],
      ['tuščias', () => []],
    ])('ne tas rinkinys (%s): 409 IMAGE_SET_MISMATCH', async (_name, mutate) => {
      const dto = await attachOk(3);
      const ids = dto.images.map((i) => i.id);
      const res = await reorder(mutate(ids));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IMAGE_SET_MISMATCH');
      expect((await storedImages()).map((i) => i._id.toString())).toEqual(ids);
    });

    it('pasikartojantis ID: 400', async () => {
      const dto = await attachOk(2);
      const id = dto.images[0]!.id;
      expect((await reorder([id, id])).status).toBe(400);
    });
  });

  describe('vieši DTO', () => {
    it('GET /products/:slug ir /sale-windows/current: url, width, height, alt; pagrindinė pirma', async () => {
      const dto = await attachOk(2);
      const ids = dto.images.map((i) => i.id);
      expect((await reorder([ids[1]!, ids[0]!])).status).toBe(200);
      const expected = [dto.images[1]!, dto.images[0]!].map((i) => ({
        url: i.url,
        width: 1600,
        height: 1200,
        alt: 'Medaus tortas',
      }));

      const one = await http().get(`/products/${dto.slug}`);
      expect(one.status).toBe(200);
      expect((one.body as ProductDto).images).toEqual(expected);
      const all = await http().get('/products');
      expect((all.body as ProductDto[])[0]!.images).toEqual(expected);

      await createSaleWindow(ctx, {
        items: [{ productId: product.productId, variantId: product.variantIds[0]! }],
      });
      const current = await http().get('/sale-windows/current');
      const item = (current.body as CurrentSaleWindowResponse).open!.items[0]!;
      expect(item.images).toEqual(expected);
      expect(item.imageUrl).toBe(expected[0]!.url);
      // Viešuose atsakymuose nėra vidinių Cloudinary laukų.
      expect(JSON.stringify(one.body)).not.toContain('publicId');
    });
  });
});

import { Types } from 'mongoose';
import request from 'supertest';
import {
  clearDatabase,
  createProduct,
  createTestContext,
  loginAdmin,
  type TestContext,
} from './helpers';

/** Vystant / testuose be CLOUDINARY_* API pasileidžia, o nuotraukų maršrutai grąžina 503. */
describe('Produktų nuotraukos be Cloudinary nustatymų', () => {
  let ctx: TestContext;
  let token: string;

  beforeAll(async () => {
    for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
      delete process.env[key];
    }
    ctx = await createTestContext();
    await clearDatabase(ctx.connection);
    token = await loginAdmin(ctx);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  it('visi nuotraukų maršrutai: 503 IMAGES_NOT_CONFIGURED; kiti veikia', async () => {
    const product = await createProduct(ctx);
    const base = `/admin/products/${product.productId.toString()}/images`;
    const http = () => request(ctx.app.getHttpServer());
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    const responses = await Promise.all([
      auth(http().post('/admin/uploads/product-image-signature')),
      auth(
        http()
          .post(base)
          .send({
            publicId: 'desert-web/test/products/foto',
            version: 1700000000,
            signature: 'a'.repeat(40),
            width: 10,
            height: 10,
            format: 'jpg',
            bytes: 100,
            secureUrl: 'https://res.cloudinary.com/x/image/upload/v1700000000/foto.jpg',
          }),
      ),
      auth(http().put(`${base}/order`).send({ imageIds: [] })),
      auth(http().delete(`${base}/${new Types.ObjectId().toString()}`)),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('IMAGES_NOT_CONFIGURED');
    }
    expect((await auth(http().get('/admin/products'))).status).toBe(200);
  });
});

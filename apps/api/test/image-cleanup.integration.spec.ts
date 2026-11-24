import { TEST_CLOUDINARY } from './cloudinary-test-env';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from '../src/product-images/cloudinary.service';
import { mongoImageReferences, runImageCleanup } from '../src/product-images/image-cleanup';
import { clearDatabase, createProduct, createTestContext, type TestContext } from './helpers';

const FOLDER = TEST_CLOUDINARY.folder;
const NOW = new Date('2026-11-24T12:00:00.000Z');
const OLD = '2026-11-01T08:00:00Z';
const CREDENTIALS = {
  cloud_name: TEST_CLOUDINARY.cloudName,
  api_key: TEST_CLOUDINARY.apiKey,
  api_secret: TEST_CLOUDINARY.apiSecret,
};

const imageDoc = (publicId: string) => ({
  publicId,
  version: 1700000000,
  url: `https://res.cloudinary.com/${TEST_CLOUDINARY.cloudName}/image/upload/v1700000000/${publicId}.jpg`,
  width: 1600,
  height: 1200,
  format: 'jpg',
  bytes: 345678,
});

/**
 * Visas images:cleanup srautas: tikras CloudinaryService (Cloudinary SDK pakeistas, jokių
 * tinklo užklausų) ir tikra DB su aktyviais ir archyvuotais produktais.
 */
describe('images:cleanup su DB ir CloudinaryService', () => {
  let ctx: TestContext;
  let service: CloudinaryService;
  let resources: jest.SpyInstance;
  let deleteResources: jest.SpyInstance;

  beforeAll(async () => {
    ctx = await createTestContext();
    service = ctx.app.get(CloudinaryService);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    jest.restoreAllMocks();
    // Du puslapiai, kad būtų patikrintas next_cursor perdavimas į SDK.
    resources = jest
      .spyOn(cloudinary.api, 'resources')
      .mockImplementation(async (options?: { [key: string]: unknown }) =>
        options?.next_cursor === 'p2'
          ? {
              resources: [
                { public_id: `${FOLDER}/archyvuoto`, created_at: OLD, bytes: 2000 },
                { public_id: `${FOLDER}/nauja`, created_at: '2026-11-24T10:00:00Z', bytes: 3000 },
              ],
            }
          : {
              resources: [
                { public_id: `${FOLDER}/aktyvaus`, created_at: OLD, bytes: 1000 },
                { public_id: `${FOLDER}/nasle`, created_at: OLD, bytes: 4000 },
              ],
              next_cursor: 'p2',
            },
      );
    deleteResources = jest
      .spyOn(cloudinary.api, 'delete_resources')
      .mockImplementation(async (ids: string[]) => ({
        deleted: Object.fromEntries(ids.map((id) => [id, 'deleted'])),
        partial: false,
      }));
  });

  async function seedProducts() {
    const active = await createProduct(ctx, { name: 'Aktyvus' });
    const archived = await createProduct(ctx, { name: 'Archyvuotas' });
    await ctx.productModel.updateOne(
      { _id: active.productId },
      { $set: { images: [imageDoc(`${FOLDER}/aktyvaus`)] } },
    );
    await ctx.productModel.updateOne(
      { _id: archived.productId },
      { $set: { isActive: false, images: [imageDoc(`${FOLDER}/archyvuoto`)] } },
    );
    await createProduct(ctx, { name: 'Be nuotraukų' });
  }

  const run = (apply: boolean) =>
    runImageCleanup(service, mongoImageReferences(ctx.productModel), {
      folder: service.require().folder,
      olderThanHours: 24,
      apply,
      now: NOW,
      log: () => undefined,
    });

  it('mongoImageReferences grąžina ir aktyvių, ir archyvuotų produktų nuotraukas', async () => {
    await seedProducts();
    const refs = mongoImageReferences(ctx.productModel);
    expect([...(await refs.allReferenced())].sort()).toEqual(
      [`${FOLDER}/aktyvaus`, `${FOLDER}/archyvuoto`].sort(),
    );
    expect(await refs.countProductsWithImages()).toBe(2);
    expect(await refs.referencedAmong([`${FOLDER}/archyvuoto`, `${FOLDER}/nasle`])).toEqual(
      new Set([`${FOLDER}/archyvuoto`]),
    );
  });

  it('dry run: randa tik tikrą našlaitį ir nieko netrina', async () => {
    await seedProducts();
    const report = await run(false);

    expect(report.selection.orphans.map((o) => o.publicId)).toEqual([`${FOLDER}/nasle`]);
    expect(report.selection).toMatchObject({ referenced: 2, tooNew: 1, outsideFolder: 0 });
    expect(deleteResources).not.toHaveBeenCalled();

    // Tik katalogo prefiksas (su „/“), tik image/upload, prisijungimo duomenys kiekvienam kvietimui.
    expect(resources).toHaveBeenCalledTimes(2);
    expect(resources).toHaveBeenNthCalledWith(1, {
      resource_type: 'image',
      type: 'upload',
      prefix: `${FOLDER}/`,
      max_results: 500,
      ...CREDENTIALS,
    });
    expect(resources).toHaveBeenNthCalledWith(2, expect.objectContaining({ next_cursor: 'p2' }));
  });

  it('--apply: ištrina tik našlaitį, archyvuoto produkto nuotrauka lieka', async () => {
    await seedProducts();
    const report = await run(true);

    expect(report).toMatchObject({ deleted: 1, failed: [] });
    expect(deleteResources).toHaveBeenCalledTimes(1);
    expect(deleteResources).toHaveBeenCalledWith([`${FOLDER}/nasle`], {
      resource_type: 'image',
      type: 'upload',
      invalidate: true,
      ...CREDENTIALS,
    });
  });
});

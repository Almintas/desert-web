/**
 * Testiniai Cloudinary nustatymai (ne tikri). Importuoti PIRMIAU už ./helpers, nes
 * ConfigModule aplinkos kintamuosius perskaito, kai įkeliamas AppModule.
 * Jest kiekvienam testų failui duoda atskirą process.env, todėl kitų failų tai neveikia.
 */
export const TEST_CLOUDINARY = {
  cloudName: 'desert-test-cloud',
  apiKey: '111122223333444',
  apiSecret: 'testams-skirta-cloudinary-paslaptis',
  folder: 'desert-web/test/products',
};

process.env.CLOUDINARY_CLOUD_NAME = TEST_CLOUDINARY.cloudName;
process.env.CLOUDINARY_API_KEY = TEST_CLOUDINARY.apiKey;
process.env.CLOUDINARY_API_SECRET = TEST_CLOUDINARY.apiSecret;
delete process.env.CLOUDINARY_FOLDER;

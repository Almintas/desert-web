import mongoose, { type Connection } from 'mongoose';
import { createAllIndexes } from '../src/database/create-indexes';
import { createTestContext, type TestContext } from './helpers';

/** Unikalūs indeksai, kurių būtinai reikia produkcijoje: [kolekcija, laukas]. */
const REQUIRED_UNIQUE: [string, string][] = [
  ['orders', 'orderNumber'],
  ['orders', 'accessToken'],
  ['products', 'slug'],
];

describe('createAllIndexes (db:indexes)', () => {
  let ctx: TestContext;
  let fresh: Connection;

  beforeAll(async () => {
    ctx = await createTestContext();
    // Atskira DB be autoIndex, kaip produkcijoje: kolekcijos yra, indeksų nėra.
    const uri = process.env.MONGODB_URI!.replace('/desert-web-test', '/desert-web-indexes');
    fresh = await mongoose.createConnection(uri, { autoIndex: false }).asPromise();
    await fresh.dropDatabase();
    for (const model of Object.values(ctx.connection.models)) {
      fresh.model(model.modelName, model.schema);
    }
    await Promise.all(Object.values(fresh.models).map((m) => m.init()));
  });

  afterAll(async () => {
    await fresh.dropDatabase();
    await fresh.close();
    await ctx.app.close();
  });

  async function uniqueFields(collection: string): Promise<string[]> {
    const indexes = await fresh.db!.collection(collection).indexes();
    return indexes.filter((i) => i.unique).flatMap((i) => Object.keys(i.key));
  }

  it('sukuria trūkstamus unikalius indeksus ir nieko netrina', async () => {
    for (const [collection, field] of REQUIRED_UNIQUE) {
      expect(await uniqueFields(collection)).not.toContain(field);
    }
    // Rankinis indeksas, kurio schemose nėra: createIndexes jo neturi ištrinti.
    await fresh.db!.collection('orders').createIndex({ totalCents: 1 }, { name: 'manual_idx' });

    const report = await createAllIndexes(fresh);

    for (const [collection, field] of REQUIRED_UNIQUE) {
      expect(await uniqueFields(collection)).toContain(field);
    }
    const ordersReport = report.find((r) => r.collection === 'orders');
    expect(ordersReport?.created).toEqual(
      expect.arrayContaining(['orderNumber_1', 'accessToken_1']),
    );
    const orderIndexNames = (await fresh.db!.collection('orders').indexes()).map((i) => i.name);
    expect(orderIndexNames).toContain('manual_idx');

    // Visi schemose aprašyti indeksai egzistuoja.
    for (const model of Object.values(fresh.models)) {
      const existing = await fresh.db!.collection(model.collection.collectionName).indexes();
      const existingKeys = existing.map((i) => JSON.stringify(i.key));
      for (const [fields] of model.schema.indexes()) {
        expect(existingKeys).toContain(JSON.stringify(fields));
      }
    }

    // Antras paleidimas nieko naujo nesukuria.
    const second = await createAllIndexes(fresh);
    expect(second.flatMap((r) => r.created)).toEqual([]);
  });
});

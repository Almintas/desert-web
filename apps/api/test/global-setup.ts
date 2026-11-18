import { MongoMemoryReplSet } from 'mongodb-memory-server';

/** Versija fiksuota, kad testai visur leistų tą patį mongod (kitą galima nurodyti per MONGOMS_VERSION). */
export const MONGOD_VERSION = '8.2.6';

declare global {
  var __MONGO_REPLSET__: MongoMemoryReplSet | undefined;
}

export default async function globalSetup(): Promise<void> {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION ?? MONGOD_VERSION },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  globalThis.__MONGO_REPLSET__ = replSet;
  // Testų workeriai paveldi process.env, todėl AppModule ConfigModule šią reikšmę pamato.
  process.env.MONGODB_URI = replSet.getUri('desert-web-test');
  process.env.NODE_ENV = 'test';
  process.env.INTERNAL_API_SECRET = 'testams-skirta-vidine-paslaptis-0123456789';
}

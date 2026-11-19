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
  // Testai siunčia daug užsakymų iš vieno IP: ribojimai išjungiami (didelės ribos), o jų
  // testai (rate-limit.spec.ts) nustato savo reikšmes.
  process.env.ORDER_RATE_LIMIT_SHORT = '100000';
  process.env.ORDER_RATE_LIMIT_DAILY = '100000';
  process.env.ORDER_ACCESS_RATE_LIMIT = '100000';
  // Cloudflare testinis „visada praeina“ secret (siteverify testuose pakeistas, žr. helpers.ts).
  process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
}

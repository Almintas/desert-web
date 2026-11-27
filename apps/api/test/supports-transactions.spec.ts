import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { type Connection } from 'mongoose';
import {
  NO_TRANSACTIONS_MESSAGE,
  supportsTransactions,
  warnIfNoTransactions,
} from '../src/database/supports-transactions';
import { MONGOD_VERSION } from './global-setup';

describe('supportsTransactions', () => {
  let standalone: MongoMemoryServer;
  let standaloneConn: Connection;
  let replSetConn: Connection;

  beforeAll(async () => {
    standalone = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? MONGOD_VERSION },
    });
    standaloneConn = await mongoose.createConnection(standalone.getUri()).asPromise();
    replSetConn = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  });

  afterAll(async () => {
    await standaloneConn?.close();
    await replSetConn?.close();
    await standalone?.stop();
  });

  it('replica set: palaiko, įspėjimo nėra', async () => {
    expect(await supportsTransactions(replSetConn)).toBe(true);
    const log = jest.fn();
    await warnIfNoTransactions(replSetConn, log);
    expect(log).not.toHaveBeenCalled();
  });

  it('standalone mongod: nepalaiko, įspėjimas su sprendimu', async () => {
    expect(await supportsTransactions(standaloneConn)).toBe(false);
    const log = jest.fn();
    await warnIfNoTransactions(standaloneConn, log);
    expect(log).toHaveBeenCalledWith(NO_TRANSACTIONS_MESSAGE);
    expect(NO_TRANSACTIONS_MESSAGE).toContain('replSetName: rs0');
  });
});

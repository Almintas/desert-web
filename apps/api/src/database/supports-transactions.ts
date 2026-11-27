import type { Connection } from 'mongoose';

/**
 * Ar MongoDB serveris palaiko transakcijas: tik replica set narys (`setName`) arba mongos
 * (`msg: 'isdbgrid'`). Atlas visada yra replica set; vietinis `mongod` pagal nutylėjimą ne.
 */
export async function supportsTransactions(connection: Connection): Promise<boolean> {
  const hello = await connection.db!.admin().command({ hello: 1 });
  return typeof hello.setName === 'string' || hello.msg === 'isdbgrid';
}

/** Paleidimo patikra: tik įspėjimas logui; jei pati patikra nepavyksta, API vis tiek veikia. */
export async function warnIfNoTransactions(
  connection: Connection,
  log: (message: string) => void,
): Promise<void> {
  try {
    if (!(await supportsTransactions(connection))) log(NO_TRANSACTIONS_MESSAGE);
  } catch {
    // Pvz., naudotojas be teisės vykdyti hello: nieko nesakom.
  }
}

export const NO_TRANSACTIONS_MESSAGE =
  'MongoDB is a standalone server, but the API needs transactions (creating sale windows, ' +
  'orders, special orders): those requests will fail with "Transaction numbers are only allowed ' +
  'on a replica set member or mongos". Use a MongoDB Atlas connection string in MONGODB_URI, or ' +
  'run the local mongod as a single-node replica set: add "replication: replSetName: rs0" to ' +
  'mongod.cfg, restart MongoDB, run rs.initiate() once in mongosh and add ?replicaSet=rs0 to ' +
  'MONGODB_URI (see README).';

import type { Connection } from 'mongoose';

export interface CreatedIndexesReport {
  model: string;
  collection: string;
  /** Indeksai, kurių prieš tai nebuvo. */
  created: string[];
}

async function indexNames(connection: Connection, collection: string): Promise<Set<string>> {
  try {
    const indexes = await connection.db!.collection(collection).indexes();
    return new Set(indexes.map((i) => String(i.name)));
  } catch {
    // Kolekcija dar neegzistuoja.
    return new Set();
  }
}

/**
 * Sukuria visus schemose aprašytus indeksus visiems connection modeliams.
 * Naudojamas createIndexes, NE syncIndexes: esami indeksai niekada netrinami.
 */
export async function createAllIndexes(connection: Connection): Promise<CreatedIndexesReport[]> {
  const report: CreatedIndexesReport[] = [];
  for (const model of Object.values(connection.models)) {
    const collection = model.collection.collectionName;
    const before = await indexNames(connection, collection);
    await model.createIndexes();
    const after = await indexNames(connection, collection);
    report.push({
      model: model.modelName,
      collection,
      created: [...after].filter((name) => name !== '_id_' && !before.has(name)),
    });
  }
  return report;
}

/**
 * Sukuria DB indeksus pagal Mongoose schemas. Produkcijoje autoIndex išjungtas, todėl
 * paleisk prieš pirmą paleidimą ir po kiekvieno schemų pakeitimo (pvz., Railway
 * Pre-deploy Command). Esamų indeksų netrina.
 *
 * Paleidimas: pnpm turbo run build --filter=@desert-web/api && pnpm --filter @desert-web/api db:indexes
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module';
import { createAllIndexes } from '../database/create-indexes';

async function main() {
  const logger = new Logger('db:indexes');
  // Nest paleidimo logų nereikia; po paleidimo įjungiam ir `log` lygį savo pranešimams.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  app.useLogger(['log', 'error', 'warn']);
  try {
    const connection = app.get<Connection>(getConnectionToken());
    const report = await createAllIndexes(connection);
    for (const r of report) {
      logger.log(
        r.created.length > 0
          ? `${r.collection}: sukurta ${r.created.join(', ')}`
          : `${r.collection}: visi indeksai jau yra`,
      );
    }
    logger.log('Indeksai sutvarkyti');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

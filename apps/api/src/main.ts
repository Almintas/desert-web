import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env';
import { warnIfNoTransactions } from './database/supports-transactions';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening: http://localhost:${port}`, 'Bootstrap');

  // Vietinis mongod be replica set: API pasileidžia, bet kiekvienas transakcijos reikalaujantis
  // veiksmas krenta 500. Aiškiai pasakom iš karto, o ne tik pirmo užsakymo metu.
  await warnIfNoTransactions(app.get(getConnectionToken()), (message) =>
    Logger.error(message, 'MongoDB'),
  );
}

void bootstrap();

import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Bendri aplikacijos nustatymai (main.ts ir testai).
 * Railway API pasiekiamas per vieną proxy, todėl pasitikim vienu X-Forwarded-For šuoliu:
 * req.ip tada yra tikras kliento IP (reikia login ribojimui).
 */
export function configureApp(app: NestExpressApplication): void {
  app.set('trust proxy', 1);
}

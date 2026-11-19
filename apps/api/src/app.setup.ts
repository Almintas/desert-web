import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { clientIpMiddleware } from './common/client-ip';
import type { Env } from './config/env';

/**
 * Bendri aplikacijos nustatymai (main.ts ir testai).
 * Railway API pasiekiamas per vieną proxy, todėl pasitikim vienu X-Forwarded-For šuoliu:
 * req.ip tada yra tikras kliento IP (reikia login ribojimui).
 * Kiekviena užklausa gauna req.clientIp (žr. client-ip.ts): užsakymų ribojimui.
 */
export function configureApp(app: NestExpressApplication): void {
  app.set('trust proxy', 1);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.use(clientIpMiddleware(config.get('INTERNAL_API_SECRET', { infer: true })));
}

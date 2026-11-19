import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { clientIpMiddleware } from './common/client-ip';
import type { Env } from './config/env';

/**
 * Bendri aplikacijos nustatymai (main.ts ir testai).
 * `trust proxy 1`: req.ip yra paskutinis X-Forwarded-For šuolis (vystymui ir testams).
 * Railway produkcijoje kliento IP imamas iš X-Real-IP (TRUST_X_REAL_IP, žr. client-ip.ts).
 * Kiekviena užklausa gauna req.clientIp: pagal jį ribojami prisijungimai ir užsakymai.
 */
export function configureApp(app: NestExpressApplication): void {
  app.set('trust proxy', 1);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.use(
    clientIpMiddleware({
      internalSecret: config.get('INTERNAL_API_SECRET', { infer: true }),
      trustRealIp: config.get('TRUST_X_REAL_IP', { infer: true }),
    }),
  );
}

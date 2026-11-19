import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { RateLimitGuard, rateLimitTracker } from './rate-limit.guard';
import { RATE_LIMIT_NAMES, rateLimitsFromConfig } from './rate-limits';

/**
 * Visi API ribojimai (atmintyje: API veikia viena instancija Railway). Taikomi tik ten, kur
 * yra @RateLimit(...): login, POST /orders ir GET /orders/access/:token.
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const limits = rateLimitsFromConfig(config);
        return {
          throttlers: RATE_LIMIT_NAMES.map((name) => ({
            name,
            limit: limits[name].limit,
            ttl: limits[name].ttlMs,
          })),
          setHeaders: false,
          getTracker: (req) => rateLimitTracker(req as Request),
        };
      },
    }),
  ],
  providers: [RateLimitGuard],
  exports: [ThrottlerModule, RateLimitGuard],
})
export class RateLimitModule {}

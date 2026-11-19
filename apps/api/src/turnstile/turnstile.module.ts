import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { createFetchSiteverifyClient, SITEVERIFY_CLIENT } from './siteverify';
import { TurnstileService } from './turnstile.service';

@Module({
  providers: [
    TurnstileService,
    {
      provide: SITEVERIFY_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createFetchSiteverifyClient(config.get('TURNSTILE_VERIFY_URL', { infer: true })),
    },
  ],
  exports: [TurnstileService],
})
export class TurnstileModule {}

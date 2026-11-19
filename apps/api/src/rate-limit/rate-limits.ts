import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/** Ribojimų pavadinimai (ThrottlerModule named throttlers). */
export const RATE_LIMIT_NAMES = [
  'admin-login',
  'order-create-short',
  'order-create-daily',
  'order-access',
] as const;
export type RateLimitName = (typeof RATE_LIMIT_NAMES)[number];

export interface RateLimit {
  /** Kiek užklausų leidžiama per langą iš vieno kliento IP. */
  limit: number;
  /** Lango ilgis milisekundėmis. */
  ttlMs: number;
  /** 429 atsakymo pranešimas (lietuviškai). */
  message: string;
}

const TOO_MANY = 'Per daug bandymų. Pabandykite po kelių minučių.';

/**
 * Visi API ribojimai vienoje vietoje. Reikšmės iš aplinkos (numatytos env.ts), kad testai ir
 * e2e galėtų jas pakeisti. Skaičiuojamas kiekvienas bandymas (ir nesėkmingas), raktas yra
 * req.clientIp (žr. common/client-ip.ts) ir maršrutas.
 */
export function rateLimitsFromConfig(
  config: ConfigService<Env, true>,
): Record<RateLimitName, RateLimit> {
  const env = <K extends keyof Env>(key: K): Env[K] => config.get(key, { infer: true });
  return {
    'admin-login': {
      limit: env('ADMIN_LOGIN_RATE_LIMIT'),
      ttlMs: env('ADMIN_LOGIN_RATE_WINDOW_SECONDS') * 1000,
      message: 'Per daug bandymų prisijungti. Pabandyk vėliau.',
    },
    /** POST /orders: 5 per 10 min. */
    'order-create-short': {
      limit: env('ORDER_RATE_LIMIT_SHORT'),
      ttlMs: env('ORDER_RATE_WINDOW_SHORT_SECONDS') * 1000,
      message: TOO_MANY,
    },
    /** POST /orders: 20 per parą. */
    'order-create-daily': {
      limit: env('ORDER_RATE_LIMIT_DAILY'),
      ttlMs: env('ORDER_RATE_WINDOW_DAILY_SECONDS') * 1000,
      message: TOO_MANY,
    },
    /** GET /orders/access/:token: 60 per minutę (slaptų nuorodų spėliojimui). */
    'order-access': {
      limit: env('ORDER_ACCESS_RATE_LIMIT'),
      ttlMs: env('ORDER_ACCESS_RATE_WINDOW_SECONDS') * 1000,
      message: TOO_MANY,
    },
  };
}

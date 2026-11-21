import { TURNSTILE_TEST_KEYS } from '@desert-web/shared';

/**
 * Web serverio aplinkos kintamieji. Be `server-only`, nes naudojama ir instrumentation.ts.
 *
 * Produkcijoje (NODE_ENV=production) privalomi API_URL, INTERNAL_API_SECRET ir
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY: be jų užsakymai neveiktų (API produkcijoje POST /orders
 * priima tik su paslaptimi ir Turnstile tokenu), todėl serveris nepasileidžia (žr.
 * instrumentation.ts). Vystant naudojamos vietinės numatytosios reikšmės ir Cloudflare
 * testinis „visada praeina“ site key.
 */
export interface WebEnv {
  apiUrl: string;
  internalApiSecret: string | undefined;
  turnstileSiteKey: string;
}

const trimmed = (v: string | undefined) => (v && v.trim().length > 0 ? v.trim() : undefined);

/**
 * NEXT_PUBLIC_ reikšmę Next įrašo į kodą builde, todėl ją būtina skaityti tiesiogiai
 * `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY` (ne per kintamąjį raktą).
 */
const SITE_KEY = trimmed(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export function validateWebEnv(raw: NodeJS.ProcessEnv = process.env): WebEnv {
  const production = raw.NODE_ENV === 'production';
  const apiUrl = trimmed(raw.API_URL);
  const secret = trimmed(raw.INTERNAL_API_SECRET);
  const siteKey = raw === process.env ? SITE_KEY : trimmed(raw.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  const issues: string[] = [];
  if (apiUrl !== undefined && !/^https?:\/\/[^\s]+$/.test(apiUrl)) {
    issues.push('API_URL: must be an http(s) URL, e.g. https://api.desertai.lt');
  }
  if (secret !== undefined && secret.length < 32) {
    issues.push('INTERNAL_API_SECRET: must be at least 32 characters');
  }
  if (production) {
    if (apiUrl === undefined) {
      issues.push(
        'API_URL: required in production (NODE_ENV=production). Set the API URL ' +
          '(Railway domain) in the web project environment (Vercel).',
      );
    }
    if (secret === undefined) {
      issues.push(
        'INTERNAL_API_SECRET: required in production (NODE_ENV=production): without it the API ' +
          'rejects orders. Set the same value (at least 32 characters) on both the API (Railway) ' +
          'and web (Vercel).',
      );
    }
    if (siteKey === undefined) {
      issues.push(
        'NEXT_PUBLIC_TURNSTILE_SITE_KEY: required in production (NODE_ENV=production). ' +
          'Value: Cloudflare → Turnstile → widget → Site key. It is inlined at build time, so ' +
          'redeploy after changing it.',
      );
    }
  }
  if (issues.length > 0) {
    throw new Error(
      `Invalid environment variables (web):\n${issues.map((i) => `  - ${i}`).join('\n')}`,
    );
  }

  return {
    apiUrl: apiUrl ?? 'http://localhost:4000',
    internalApiSecret: secret,
    turnstileSiteKey: siteKey ?? TURNSTILE_TEST_KEYS.siteKeyPass,
  };
}

let cached: WebEnv | undefined;

/** Patikrinti kintamieji (pirmą kartą patikrinama ir įsimenama). */
export function webEnv(): WebEnv {
  cached ??= validateWebEnv();
  return cached;
}

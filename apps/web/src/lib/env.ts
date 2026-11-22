import { TURNSTILE_TEST_KEYS } from '@desert-web/shared';

/**
 * Web serverio aplinkos kintamieji. Be `server-only`, nes naudojama ir instrumentation.ts.
 *
 * Produkcijoje (NODE_ENV=production, taip pat Vercel Preview) privalomas API_URL: be jo
 * neveikia niekas, todėl serveris nepasileidžia (žr. instrumentation.ts).
 *
 * INTERNAL_API_SECRET ir NEXT_TURNSTILE_SITE_KEY produkcijoje irgi privalomi, bet be jų
 * svetainė veikia, o atmetami tik užsakymai (`missingForOrders`, žr. uzsakymas/actions.ts),
 * kaip ir admin prisijungimas be paslapties. Serverless aplinkoje „serverio startas“ yra
 * kiekvienas šaltas paleidimas, todėl ten numesta klaida numuštų visą parduotuvę.
 * - be paslapties API visus užsakymus skaičiuotų vienam Vercel IP (bendras ribojimas visiems
 *   pirkėjams), o produkcinis API juos vis tiek atmestų (403 FORBIDDEN_CLIENT);
 * - be site key būtų rodomas Cloudflare testinis valdiklis, kurio tokenų produkcinis API
 *   (su tikru TURNSTILE_SECRET_KEY) nepriima.
 * Vystant abu neprivalomi: be site key naudojamas testinis „visada praeina“.
 */
export interface WebEnv {
  apiUrl: string;
  internalApiSecret: string | undefined;
  turnstileSiteKey: string;
  /** Produkcijoje trūkstami kintamieji, be kurių užsakymai nepriimami. Vystant visada tuščias. */
  missingForOrders: OrderEnvKey[];
}

export type OrderEnvKey = 'INTERNAL_API_SECRET' | 'NEXT_TURNSTILE_SITE_KEY';

const trimmed = (v: string | undefined) => (v && v.trim().length > 0 ? v.trim() : undefined);

export function validateWebEnv(raw: NodeJS.ProcessEnv = process.env): WebEnv {
  const production = raw.NODE_ENV === 'production';
  const apiUrl = trimmed(raw.API_URL);
  const secret = trimmed(raw.INTERNAL_API_SECRET);
  const siteKey = trimmed(raw.NEXT_TURNSTILE_SITE_KEY);

  const issues: string[] = [];
  if (apiUrl !== undefined && !/^https?:\/\/[^\s]+$/.test(apiUrl)) {
    issues.push('API_URL: must be an http(s) URL, e.g. https://api.desertai.lt');
  }
  if (secret !== undefined && secret.length < 32) {
    issues.push('INTERNAL_API_SECRET: must be at least 32 characters');
  }
  if (production && apiUrl === undefined) {
    issues.push(
      'API_URL: required in production (NODE_ENV=production). Set the API URL ' +
        '(Railway domain) in the web project environment (Vercel).',
    );
  }
  if (issues.length > 0) {
    throw new Error(
      `Invalid environment variables (web):\n${issues.map((i) => `  - ${i}`).join('\n')}`,
    );
  }

  const missingForOrders: OrderEnvKey[] = [];
  if (production && secret === undefined) missingForOrders.push('INTERNAL_API_SECRET');
  if (production && siteKey === undefined) missingForOrders.push('NEXT_TURNSTILE_SITE_KEY');

  return {
    apiUrl: apiUrl ?? 'http://localhost:4000',
    internalApiSecret: secret,
    turnstileSiteKey: siteKey ?? TURNSTILE_TEST_KEYS.siteKeyPass,
    missingForOrders,
  };
}

const ORDER_ENV_HINTS: Record<OrderEnvKey, string> = {
  INTERNAL_API_SECRET:
    'INTERNAL_API_SECRET (same value as the API on Railway, at least 32 characters)',
  NEXT_TURNSTILE_SITE_KEY:
    'NEXT_TURNSTILE_SITE_KEY (Cloudflare Turnstile site key matching TURNSTILE_SECRET_KEY on the API)',
};

/** Aiški serverio logo eilutė, kai užsakymai išjungti dėl trūkstamų kintamųjų; kitaip null. */
export function ordersDisabledReason(env: WebEnv): string | null {
  if (env.missingForOrders.length === 0) return null;
  return (
    'Orders are rejected: missing required production environment variables in the web project ' +
    `(Vercel): ${env.missingForOrders.map((k) => ORDER_ENV_HINTS[k]).join('; ')}.`
  );
}

let cached: WebEnv | undefined;

/** Patikrinti kintamieji (pirmą kartą patikrinama ir įsimenama). */
export function webEnv(): WebEnv {
  cached ??= validateWebEnv();
  return cached;
}

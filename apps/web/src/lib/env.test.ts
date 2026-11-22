import { TURNSTILE_TEST_KEYS } from '@desert-web/shared';
import { describe, expect, it } from 'vitest';
import { ordersDisabledReason, validateWebEnv } from './env';

const SECRET = 'a'.repeat(32);
const production = {
  NODE_ENV: 'production',
  API_URL: 'https://api.example.lt',
  INTERNAL_API_SECRET: SECRET,
  NEXT_TURNSTILE_SITE_KEY: '0x4AAAAAAAtikras',
} as NodeJS.ProcessEnv;

describe('validateWebEnv', () => {
  it('vystant nieko nereikia: užsakymai neišjungti, testinis Turnstile site key', () => {
    const env = validateWebEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(env.apiUrl).toBe('http://localhost:4000');
    expect(env.internalApiSecret).toBeUndefined();
    expect(env.turnstileSiteKey).toBe(TURNSTILE_TEST_KEYS.siteKeyPass);
    expect(env.missingForOrders).toEqual([]);
    expect(ordersDisabledReason(env)).toBeNull();
  });

  it('produkcijoje su visais kintamaisiais: užsakymai įjungti', () => {
    const env = validateWebEnv(production);
    expect(env.internalApiSecret).toBe(SECRET);
    expect(env.turnstileSiteKey).toBe('0x4AAAAAAAtikras');
    expect(ordersDisabledReason(env)).toBeNull();
  });

  it.each([undefined, '', '   '])(
    'produkcijoje INTERNAL_API_SECRET=%j: serveris veikia, užsakymai išjungti',
    (value) => {
      const env = validateWebEnv({ ...production, INTERNAL_API_SECRET: value });
      expect(env.missingForOrders).toEqual(['INTERNAL_API_SECRET']);
      expect(ordersDisabledReason(env)).toMatch(/Orders are rejected.*INTERNAL_API_SECRET/);
    },
  );

  it('produkcijoje be Turnstile site key: užsakymai išjungti', () => {
    const env = validateWebEnv({ ...production, NEXT_TURNSTILE_SITE_KEY: undefined });
    expect(env.missingForOrders).toEqual(['NEXT_TURNSTILE_SITE_KEY']);
    expect(ordersDisabledReason(env)).toMatch(/NEXT_TURNSTILE_SITE_KEY/);
  });

  it('produkcijoje be abiejų: išvardijami abu', () => {
    const env = validateWebEnv({
      NODE_ENV: 'production',
      API_URL: 'https://api.example.lt',
    } as NodeJS.ProcessEnv);
    expect(env.missingForOrders).toEqual(['INTERNAL_API_SECRET', 'NEXT_TURNSTILE_SITE_KEY']);
  });

  it('produkcijoje be API_URL: klaida (be jo neveikia niekas)', () => {
    expect(() => validateWebEnv({ ...production, API_URL: undefined })).toThrow(
      /API_URL: required in production/,
    );
  });

  it('per trumpa paslaptis ir netinkamas API_URL atmetami visose aplinkose', () => {
    for (const NODE_ENV of ['development', 'production'] as const) {
      expect(() =>
        validateWebEnv({ ...production, NODE_ENV, INTERNAL_API_SECRET: 'trumpa' }),
      ).toThrow(/at least 32 characters/);
      expect(() => validateWebEnv({ ...production, NODE_ENV, API_URL: 'api.lt' })).toThrow(
        /http\(s\) URL/,
      );
    }
  });
});

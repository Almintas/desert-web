/**
 * Cloudflare Turnstile testiniai raktai (vystymui, testams ir e2e). Šaltinis:
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 *
 * Testiniai site key generuoja tokeną `XXXX.DUMMY.TOKEN.XXXX`. Testiniai secret key priima tik
 * jį, o produkciniai secret key jį atmeta, todėl testinis raktas produkcijoje neveiks.
 */
export const TURNSTILE_TEST_KEYS = {
  /** Visada praeina (matomas valdiklis). */
  siteKeyPass: '1x00000000000000000000AA',
  /** Visada blokuoja (matomas valdiklis). */
  siteKeyBlock: '2x00000000000000000000AB',
  /** siteverify visada sėkmingas. */
  secretPass: '1x0000000000000000000000000000000AA',
  /** siteverify visada nesėkmingas (invalid-input-response). */
  secretFail: '2x0000000000000000000000000000000AA',
  /** siteverify grąžina timeout-or-duplicate („token already spent“). */
  secretSpent: '3x0000000000000000000000000000000AA',
  /** Tokenas, kurį sugeneruoja testiniai site key. */
  dummyToken: 'XXXX.DUMMY.TOKEN.XXXX',
} as const;

export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

import { TURNSTILE_SITEVERIFY_URL, TURNSTILE_TEST_KEYS } from '@desert-web/shared';
import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const booleanString = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v === 'true' || v === '1'));

const CLOUDINARY_FOLDER_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const CLOUDINARY_REQUIRED = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    /** Privalomas visur; tikrinamas superRefine, kad trūkstami kintamieji būtų išvardyti kartu. */
    MONGODB_URI: optionalString,
    /**
     * Neprivaloma: DB pavadinimas, jei jis turi skirtis nuo nurodyto MONGODB_URI (pvz., kai
     * naudojamas kito projekto klasterio URI). Mongoose `dbName` turi pirmenybę prieš URI kelią.
     */
    MONGODB_DB_NAME: optionalString.refine(
      (v) => v === undefined || /^[A-Za-z0-9_-]{1,63}$/.test(v),
      'MONGODB_DB_NAME: only letters, digits, _ and - (up to 63 characters)',
    ),
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:3000,http://localhost:3001')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    /** Admino sesijos trukmė dienomis. */
    ADMIN_SESSION_TTL_DAYS: z.coerce.number().positive().default(7),
    /** Kiek nesėkmingų / bet kokių prisijungimo bandymų leidžiama iš vieno IP per langą. */
    ADMIN_LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(5),
    ADMIN_LOGIN_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    /**
     * Užsakymų ribojimas vienam IP (žr. common/rate-limits.ts). Numatytos reikšmės skirtos
     * produkcijai; keičiami tik testuose ir e2e.
     */
    ORDER_RATE_LIMIT_SHORT: positiveInt(5),
    ORDER_RATE_WINDOW_SHORT_SECONDS: positiveInt(10 * 60),
    ORDER_RATE_LIMIT_DAILY: positiveInt(20),
    ORDER_RATE_WINDOW_DAILY_SECONDS: positiveInt(24 * 60 * 60),
    ORDER_ACCESS_RATE_LIMIT: positiveInt(60),
    ORDER_ACCESS_RATE_WINDOW_SECONDS: positiveInt(60),
    /**
     * Ar kliento IP imti iš X-Real-IP (be patikimo X-Client-IP). Railway viešas edge šią
     * antraštę nustato pats (https://docs.railway.com/networking/public-networking/specs-and-limits),
     * o X-Forwarded-For grandinėje gali būti keli Railway šuoliai. Numatyta: true produkcijoje.
     */
    TRUST_X_REAL_IP: booleanString,
    /**
     * Cloudflare Turnstile secret. Produkcijoje privalomas; vystant ir testuose numatytas
     * Cloudflare testinis „visada praeina“ raktas.
     */
    TURNSTILE_SECRET_KEY: optionalString,
    /** Tik testams / e2e (vietinis Cloudflare pakaitalas). Numatyta: Cloudflare siteverify. */
    TURNSTILE_VERIFY_URL: z.url().default(TURNSTILE_SITEVERIFY_URL),
    /**
     * Bendra paslaptis su admin Next.js serveriu: su ja admin app perduoda tikrą naršyklės IP
     * prisijungimų ribojimui (X-Client-IP). Produkcijoje privaloma (žr. superRefine žemiau);
     * vystant ir testuose be jos ribojama pagal req.ip.
     */
    INTERNAL_API_SECRET: optionalString.refine(
      (v) => v === undefined || v.length >= 32,
      'INTERNAL_API_SECRET must be at least 32 characters',
    ),
    RESEND_API_KEY: optionalString,
    RESEND_FROM_EMAIL: optionalString,
    /**
     * Produktų nuotraukos (Cloudinary). Produkcijoje privalomi visi trys (žr. superRefine);
     * vystant ir testuose be jų nuotraukų maršrutai grąžina 503 IMAGES_NOT_CONFIGURED.
     */
    CLOUDINARY_CLOUD_NAME: optionalString.refine(
      (v) => v === undefined || /^[A-Za-z0-9_-]+$/.test(v),
      'CLOUDINARY_CLOUD_NAME may contain only letters, digits, _ and -',
    ),
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    /**
     * Cloudinary katalogas produktų nuotraukoms. Numatyta desert-web/<NODE_ENV>/products,
     * kad vystymo ir testų įkėlimai nesimaišytų su produkcija.
     */
    CLOUDINARY_FOLDER: optionalString.refine(
      (v) => v === undefined || CLOUDINARY_FOLDER_PATTERN.test(v),
      'CLOUDINARY_FOLDER: segments of letters, digits, _ and -, separated by /',
    ),
  })
  .superRefine((env, ctx) => {
    if (env.MONGODB_URI === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is required (MongoDB Atlas connection string).',
      });
    }
    // Be paslapties visi prisijungimai per admin app skaičiuojami vienam IP (admin serverio),
    // todėl bet kas galėtų keliais bandymais užblokuoti prisijungimą visiems adminams.
    if (env.NODE_ENV === 'production' && env.INTERNAL_API_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['INTERNAL_API_SECRET'],
        message:
          'INTERNAL_API_SECRET is required in production (NODE_ENV=production). ' +
          'Set the same value (at least 32 characters) on both the API (Railway) and the admin app (Vercel).',
      });
    }
    if (env.NODE_ENV === 'production' && env.TURNSTILE_SECRET_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURNSTILE_SECRET_KEY'],
        message:
          'TURNSTILE_SECRET_KEY is required in production (NODE_ENV=production): without it ' +
          'order bot protection does not work. Value: Cloudflare → Turnstile → widget → Secret key.',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const key of CLOUDINARY_REQUIRED) {
        if (env[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required in production (NODE_ENV=production): product images do not work without it.`,
          });
        }
      }
    }
  })
  .transform((env) => ({
    ...env,
    MONGODB_URI: env.MONGODB_URI as string,
    CLOUDINARY_FOLDER: env.CLOUDINARY_FOLDER ?? `desert-web/${env.NODE_ENV}/products`,
    TRUST_X_REAL_IP: env.TRUST_X_REAL_IP ?? env.NODE_ENV === 'production',
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_KEYS.secretPass,
  }));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.map(String).join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}

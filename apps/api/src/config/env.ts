import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI privalomas'),
    CORS_ORIGINS: z
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
     * Bendra paslaptis su admin Next.js serveriu: su ja admin app perduoda tikrą naršyklės IP
     * prisijungimų ribojimui (X-Client-IP). Produkcijoje privaloma (žr. superRefine žemiau);
     * vystant ir testuose be jos ribojama pagal req.ip.
     */
    INTERNAL_API_SECRET: optionalString.refine(
      (v) => v === undefined || v.length >= 32,
      'INTERNAL_API_SECRET turi būti bent 32 simbolių',
    ),
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    // Be paslapties visi prisijungimai per admin app skaičiuojami vienam IP (admin serverio),
    // todėl bet kas galėtų keliais bandymais užblokuoti prisijungimą visiems adminams.
    if (env.NODE_ENV === 'production' && env.INTERNAL_API_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['INTERNAL_API_SECRET'],
        message:
          'INTERNAL_API_SECRET privalomas produkcijoje (NODE_ENV=production). ' +
          'Nustatyk tą pačią reikšmę (bent 32 simboliai) ir API (Railway), ir admin app (Vercel).',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.map(String).join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Netinkami aplinkos kintamieji:\n${details}`);
  }
  return result.data;
}

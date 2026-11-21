import { z } from 'zod';
import { ADMIN_ROLES, type AdminRole } from '../enums';

export const ADMIN_PASSWORD_MIN_LENGTH = 12;

/** Naujo slaptažodžio taisyklės (admino kūrimas / slaptažodžio keitimas). */
export const adminPasswordSchema = z
  .string()
  .min(
    ADMIN_PASSWORD_MIN_LENGTH,
    `Slaptažodis turi būti bent ${ADMIN_PASSWORD_MIN_LENGTH} simbolių`,
  )
  .max(200, 'Slaptažodis per ilgas');

export const adminEmailSchema = z.string().trim().pipe(z.email('Netinkamas el. paštas').max(200));

export const adminRoleSchema = z.enum(ADMIN_ROLES);

/**
 * Prisijungimas. Slaptažodžio ilgio čia netikrinam: neteisingas slaptažodis turi gauti
 * tą patį 401 atsakymą, o ne 400, kuris išduotų taisykles.
 */
export const adminLoginInputSchema = z.object({
  email: adminEmailSchema,
  password: z.string().min(1, 'Įvesk slaptažodį').max(200, 'Slaptažodis per ilgas'),
});
export type AdminLoginInput = z.infer<typeof adminLoginInputSchema>;

/** POST /admin/admins: owner sukuria naują adminą. */
export const adminCreateInputSchema = z.object({
  email: adminEmailSchema,
  password: adminPasswordSchema,
  role: adminRoleSchema,
});
export type AdminCreateInput = z.infer<typeof adminCreateInputSchema>;

/** Klaidų kodai, kuriuos grąžina /admin/admins (laukas `code` klaidos atsakyme). */
export const ADMIN_ERROR_CODES = [
  /** 409: adminas su tokiu el. paštu jau yra. */
  'ADMIN_EMAIL_TAKEN',
] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export interface AdminDto {
  id: string;
  email: string;
  role: AdminRole;
  createdAt: string;
}

/** POST /admin/auth/login atsakymas. token siunčiamas kaip `Authorization: Bearer <token>`. */
export interface AdminLoginResponse {
  token: string;
  /** ISO data, kada sesija baigiasi. */
  expiresAt: string;
  admin: AdminDto;
}

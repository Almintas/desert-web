import { z } from 'zod';

/** Ribos, kurias tikrina ir API, ir admin forma. */
export const SPECIAL_ORDER_LEAD_TIME_DAYS = { min: 0, max: 60 } as const;
export const SPECIAL_ORDER_MAX_DAYS_AHEAD = { min: 1, max: 365 } as const;

const days = (limits: { min: number; max: number }) =>
  z
    .number({ error: 'Įvesk skaičių' })
    .int('Turi būti sveikasis skaičius')
    .min(limits.min, `Ne mažiau kaip ${limits.min}`)
    .max(limits.max, `Ne daugiau kaip ${limits.max}`);

/**
 * Specialių užsakymų nustatymai. Pageidaujama data turi būti tarp
 * šiandien + leadTimeDays ir šiandien + maxDaysAhead (Vilniaus laiku, imtinai).
 */
export const specialOrderSettingsInputSchema = z
  .object({
    /** Ar pirkėjai gali pateikti užklausas (numatyta: išjungta). */
    enabled: z.boolean(),
    /** Mažiausiai kiek dienų iš anksto (0: galima ir šiandienai). */
    leadTimeDays: days(SPECIAL_ORDER_LEAD_TIME_DAYS),
    /** Daugiausiai kiek dienų į priekį. */
    maxDaysAhead: days(SPECIAL_ORDER_MAX_DAYS_AHEAD),
  })
  .refine((s) => s.maxDaysAhead >= s.leadTimeDays, {
    message: 'Turi būti ne mažiau nei „Mažiausiai dienų iš anksto“',
    path: ['maxDaysAhead'],
  });
export type SpecialOrderSettings = z.infer<typeof specialOrderSettingsInputSchema>;

export const DEFAULT_SPECIAL_ORDER_SETTINGS: SpecialOrderSettings = {
  enabled: false,
  leadTimeDays: 7,
  maxDaysAhead: 90,
};

/** PUT /admin/settings (tik owner). Visas dokumentas pakeičiamas. */
export const adminSettingsInputSchema = z.object({
  specialOrders: specialOrderSettingsInputSchema,
});
export type AdminSettingsInput = z.infer<typeof adminSettingsInputSchema>;

/** GET / PUT /admin/settings atsakymas. */
export interface SettingsDto {
  specialOrders: SpecialOrderSettings;
  /** null: nustatymai dar niekada nekeisti (numatytosios reikšmės). */
  updatedAt: string | null;
}

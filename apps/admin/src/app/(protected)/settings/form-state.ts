import type { SpecialOrderSettings } from '@desert-web/shared';

/** saveSettingsAction atsakymas (sėkmės atveju vyksta redirect). */
export interface SettingsFormState {
  error?: string;
  /** Laukų klaidos pagal API kelią (pvz., "specialOrders.leadTimeDays"). */
  fieldErrors?: Record<string, string>;
}

export type SettingsFormValues = SpecialOrderSettings;

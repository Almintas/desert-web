import {
  type ConfirmSpecialOrderInputBody,
  confirmSpecialOrderInputSchema,
  isCalendarDate,
  parseEurToCents,
  vilniusLocalToUtc,
} from '@desert-web/shared';

export const SPECIAL_ORDER_COMMANDS = ['confirm', 'reject', 'cancel', 'complete'] as const;
export type SpecialOrderCommand = (typeof SPECIAL_ORDER_COMMANDS)[number];

/** Server Action atsakymas (sėkmės atveju vyksta redirect). */
export interface SpecialOrderActionState {
  error?: string;
  /**
   * Laukų klaidos: totalCents, adminMessage, pickupDate, pickupFrom, pickupTo, pickupLocation
   * (patvirtinimas) ir reason (atmetimas / atšaukimas).
   */
  fieldErrors?: Record<string, string>;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Patvirtinimo forma -> API įvestis. Atsiėmimas įvedamas kaip diena (date) ir laiko
 * intervalas (time) Vilniaus laiku; abu laikai verčiami į UTC per vilniusLocalToUtc (ta pati
 * DST taisyklė kaip pardavimo languose). Suma įvedama eurais („150,00“) ir verčiama centais.
 */
export function readConfirmForm(formData: FormData): {
  input: ConfirmSpecialOrderInputBody | null;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  const rawPrice = text(formData, 'totalPrice');
  const totalCents = parseEurToCents(rawPrice);
  if (totalCents === null) {
    fieldErrors.totalCents = rawPrice ? 'Netinkama suma (pvz., 150,00)' : 'Įvesk galutinę sumą';
  }

  const date = text(formData, 'pickupDate');
  if (!isCalendarDate(date)) fieldErrors.pickupDate = 'Pasirink atsiėmimo dieną';

  const time = (key: 'pickupFrom' | 'pickupTo'): string | null => {
    const raw = text(formData, key);
    if (!TIME.test(raw)) {
      fieldErrors[key] = 'Įvesk laiką (pvz., 10:00)';
      return null;
    }
    if (fieldErrors.pickupDate) return null;
    const utc = vilniusLocalToUtc(`${date}T${raw}`);
    if (!utc) fieldErrors[key] = 'Netinkamas laikas';
    return utc?.toISOString() ?? null;
  };
  const pickupFrom = time('pickupFrom');
  const pickupTo = time('pickupTo');

  const input = {
    totalCents: totalCents ?? Number.NaN,
    adminMessage: text(formData, 'adminMessage') || undefined,
    pickupFrom: pickupFrom ?? '',
    pickupTo: pickupTo ?? '',
    pickupLocation: text(formData, 'pickupLocation'),
  };
  const parsed = confirmSpecialOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.map(String).join('.')] ??= issue.message;
    }
  }
  return { input: Object.keys(fieldErrors).length === 0 ? input : null, fieldErrors };
}

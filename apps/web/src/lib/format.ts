// Datų formatai bendri su API laiškais (parduotuvės laiku): žr. packages/shared/src/time.ts.
import { formatDateTime, formatDay, formatTime, SHOP_TIMEZONE } from '@desert-web/shared';

export {
  capitalize,
  formatDateTime,
  formatDateTimeWithWeekday,
  formatDay,
  formatPickupRange,
  formatTime,
} from '@desert-web/shared';

/** Lietuviška daugiskaita: plural(1, ['prekė', 'prekės', 'prekių']) -> „prekė“. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 11 || mod100 > 19)) return few;
  return many;
}

const weekdayFormatter = new Intl.DateTimeFormat('lt-LT', {
  timeZone: SHOP_TIMEZONE,
  weekday: 'long',
});

/** Savaitės diena galininku sakinio viduriui: „sekmadienį“, „pirmadienį“. */
export function formatWeekdayAccusative(value: string | Date): string {
  return weekdayFormatter.format(new Date(value)).replace(/is$/, 'į');
}

/** „sekmadienį, gruodžio 20 d. 10:00“ (sakinio viduriui, parduotuvės laiku). */
export function formatOnDateTime(value: string | Date): string {
  return `${formatWeekdayAccusative(value)}, ${formatDateTime(value)}`;
}

/**
 * Atsiėmimo laikas sakinio viduriui: „sekmadienį, gruodžio 20 d. 10:00–14:00“ arba, jei skirtingos
 * dienos, „gruodžio 20 d. 10:00 – gruodžio 21 d. 14:00“.
 */
export function formatPickupWhen(from: string | Date, to: string | Date): string {
  // Brūkšnys su žodžio jungtimis: laiko intervalas nelūžta per pusę.
  if (formatDay(from) === formatDay(to)) {
    return `${formatOnDateTime(from)}⁠–⁠${formatTime(to)}`;
  }
  return `${formatDateTime(from)} – ${formatDateTime(to)}`;
}

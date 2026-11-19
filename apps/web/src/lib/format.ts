import { SHOP_TIMEZONE } from '@desert-web/shared';

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('lt-LT', { timeZone: SHOP_TIMEZONE, ...options });

const dayFormatter = fmt({ month: 'long', day: 'numeric' });
const weekdayFormatter = fmt({ weekday: 'long' });
const timeFormatter = fmt({ hour: '2-digit', minute: '2-digit' });
const keyFormatter = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });

/** „gruodžio 20 d.“ (be eilutės lūžio tarp skaičiaus ir „d.“). */
export const formatDay = (value: string | Date) =>
  dayFormatter.format(new Date(value)).replace(/(\d+) d\./, '$1\u00a0d.');

/** „10:00“ */
export const formatTime = (value: string | Date) => timeFormatter.format(new Date(value));

/** „gruodžio 20 d. 10:00“ (parduotuvės laiku). */
export const formatDateTime = (value: string | Date) => `${formatDay(value)} ${formatTime(value)}`;

/** „sekmadienis, gruodžio 20 d., 10:00“ (sakinio pradžiai: capitalize). */
export function formatDateTimeWithWeekday(value: string | Date): string {
  return `${weekdayFormatter.format(new Date(value))}, ${formatDay(value)}, ${formatTime(value)}`;
}

export const capitalize = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/**
 * Atsiėmimo laikas (sakinio pradžiai): „Sekmadienis, gruodžio 20 d., 10:00–14:00“ arba, jei skirtingos dienos,
 * „gruodžio 20 d. 10:00 – gruodžio 21 d. 14:00“.
 */
export function formatPickupRange(from: string | Date, to: string | Date): string {
  const sameDay = keyFormatter.format(new Date(from)) === keyFormatter.format(new Date(to));
  // Brūkšnys su žodžio jungtimis: laiko intervalas nelūžta per pusę.
  if (sameDay)
    return capitalize(`${formatDateTimeWithWeekday(from)}\u2060–\u2060${formatTime(to)}`);
  return `${formatDateTime(from)} – ${formatDateTime(to)}`;
}

/** Lietuviška daugiskaita: plural(1, ['prekė', 'prekės', 'prekių']) -> „prekė“. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 11 || mod100 > 19)) return few;
  return many;
}

// Datų formatai bendri su API laiškais (parduotuvės laiku): žr. packages/shared/src/time.ts.
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

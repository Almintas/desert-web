/**
 * Visi pinigai saugomi centais (sveikais skaičiais). Jokių float sumų.
 */

const eurFormatter = new Intl.NumberFormat('lt-LT', {
  style: 'currency',
  currency: 'EUR',
});

/** 1250 -> "12,50 €" */
export function formatEur(cents: number): string {
  return eurFormatter.format(cents / 100);
}

/** "12,50" arba "12.50" -> 1250. Grąžina null, jei įvestis netinkama. */
export function parseEurToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** 1250 -> "12,50" (formos laukui; priešinga parseEurToCents). Be float aritmetikos. */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

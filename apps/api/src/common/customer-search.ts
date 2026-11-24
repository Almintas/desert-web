import { normalizeEmail, normalizePhone } from '@desert-web/shared';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Telefono pradžia be šalies kodo: tik skaitmenys (galima su tarpais / brūkšneliais), kurie
 * prasideda 8, 370 arba +370. Pvz., "8612" → "612", "+370 612" → "612". Kitaip null.
 */
export function localPhonePrefix(q: string): string | null {
  const compact = q.replace(/[\s\-()]/g, '');
  const match = /^(?:\+370|370|8)(\d+)$/.exec(compact);
  return match ? match[1]! : null;
}

/**
 * Admin paieškos sąlygos ($or): dokumento numeris (`numberField`, pvz., orderNumber),
 * pirkėjo vardas, el. paštas (normalizuotas) arba telefonas (normalizuotas). Dokumentai turi
 * `customer.name`, `customer.emailNormalized` ir `customer.phoneNormalized` (užsakymai ir
 * specialūs užsakymai).
 */
export function customerSearchConditions(q: string, numberField: string): Record<string, RegExp>[] {
  const contains = (s: string) => new RegExp(escapeRegex(s), 'i');
  const conditions: Record<string, RegExp>[] = [
    { [numberField]: contains(q) },
    { 'customer.name': contains(q) },
    { 'customer.emailNormalized': contains(normalizeEmail(q)) },
  ];
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3) {
    conditions.push(
      { 'customer.phoneNormalized': contains(normalizePhone(q)) },
      { 'customer.phoneNormalized': contains(digits) },
    );
    // Lietuviškas numeris dalimis: "8612" ar "+370612" randa "+37061234567" (be 8 / 370).
    const local = localPhonePrefix(q);
    if (local) {
      conditions.push({ 'customer.phoneNormalized': new RegExp(`^\\+370${local}`) });
    }
  }
  return conditions;
}

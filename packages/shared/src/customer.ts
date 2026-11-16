/** Naudojama limitams „vienam pirkėjui“ tikrinti. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalizuoja telefoną į E.164. Lietuviški formatai:
 * "8 612 34567", "+370 612 34567", "370612345678", "612 34567" -> "+37061234567".
 * Kitų šalių numerius su "+" palieka tik be tarpų.
 */
export function normalizePhone(phone: string): string {
  const compact = phone.replace(/[\s\-()]/g, '');
  if (compact.startsWith('+')) return compact;
  if (compact.startsWith('00')) return `+${compact.slice(2)}`;
  if (compact.startsWith('370')) return `+${compact}`;
  if (compact.startsWith('8') && compact.length === 9) return `+370${compact.slice(1)}`;
  if (compact.length === 8) return `+370${compact}`;
  return compact;
}

/**
 * DB saugo laikus UTC. Pirkėjams ir adminui rodome parduotuvės laiku.
 */
export const SHOP_TIMEZONE = 'Europe/Vilnius';

const dateTimeFormatter = new Intl.DateTimeFormat('lt-LT', {
  timeZone: SHOP_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat('lt-LT', {
  timeZone: SHOP_TIMEZONE,
  dateStyle: 'medium',
});

export function formatShopDateTime(value: Date | string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatShopDate(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

const yearFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TIMEZONE,
  year: 'numeric',
});

/** Metai parduotuvės laiku (pvz., gruodžio 31 d. 23:30 Vilniuje dar senieji metai). */
export function getShopYear(value: Date | string = new Date()): number {
  return Number(yearFormatter.format(new Date(value)));
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function vilniusParts(instant: number): LocalParts {
  const parts: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(instant))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** Vilniaus poslinkis nuo UTC milisekundėmis tam momentui (+2 h žiemą, +3 h vasarą). */
function vilniusOffset(instant: number): number {
  const truncated = Math.floor(instant / 1000) * 1000;
  const p = vilniusParts(truncated);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - truncated;
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const DAY_MS = 86_400_000;

/**
 * Vilniaus vietinis laikas iš `<input type="datetime-local">` („2026-12-20T10:00“) -> UTC Date.
 * Grąžina null, jei eilutė netinkama (pvz., 2026-02-30T10:00).
 *
 * Laikrodžio persukimas (Europe/Vilnius, paskutinį kovo ir spalio sekmadienį):
 * - Kovo 03:00–03:59 vietinio laiko nėra (03:00 EET -> 04:00 EEST). Toks laikas
 *   pastumiamas pirmyn per tarpą: 03:30 -> 04:30 EEST (01:30 UTC).
 * - Spalio 03:00–03:59 būna du kartus (04:00 EEST -> 03:00 EET). Imamas ankstesnis,
 *   t. y. vasaros laikas: 03:30 -> 03:30 EEST (00:30 UTC).
 * Tai ta pati taisyklė kaip Temporal `disambiguation: 'compatible'`.
 */
export function vilniusLocalToUtc(local: string): Date | null {
  const m = LOCAL_DATE_TIME.exec(local.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map((v) => Number(v ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  // Laukai, perskaityti „kaip UTC“; tikrinam, ar diena egzistuoja (vasario 30 d. ir pan.).
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== year || check.getUTCDate() !== day) return null;

  // Poslinkiai parą prieš ir po: persukimas Vilniuje vyksta ne dažniau kaip kartą per parą.
  const offsetBefore = vilniusOffset(asUtc - DAY_MS);
  const offsetAfter = vilniusOffset(asUtc + DAY_MS);
  const candidates = [asUtc - offsetBefore, asUtc - offsetAfter].filter(
    (t) => t + vilniusOffset(t) === asUtc,
  );
  // Abu tinka: kartojama valanda, imam ankstesnį. Nė vienas: neegzistuojanti valanda,
  // imam poslinkį prieš persukimą (rezultatas atsiduria po tarpo).
  return new Date(candidates.length > 0 ? Math.min(...candidates) : asUtc - offsetBefore);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC Date / ISO -> Vilniaus vietinis laikas `<input type="datetime-local">` laukui („2026-12-20T10:00“). */
export function utcToVilniusLocal(value: Date | string): string {
  const p = vilniusParts(new Date(value).getTime());
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// --- Lietuviški datų formatai pirkėjams (web ir laiškai), parduotuvės laiku ---

const ltFormatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('lt-LT', { timeZone: SHOP_TIMEZONE, ...options });

const dayFormatter = ltFormatter({ month: 'long', day: 'numeric' });
const weekdayFormatter = ltFormatter({ weekday: 'long' });
const timeFormatter = ltFormatter({ hour: '2-digit', minute: '2-digit' });
const dayKeyFormatter = ltFormatter({ year: 'numeric', month: '2-digit', day: '2-digit' });

/** „gruodžio 20 d.“ (be eilutės lūžio tarp skaičiaus ir „d.“). */
export const formatDay = (value: string | Date) =>
  dayFormatter.format(new Date(value)).replace(/(\d+) d\./, '$1 d.');

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
  const sameDay = dayKeyFormatter.format(new Date(from)) === dayKeyFormatter.format(new Date(to));
  // Brūkšnys su žodžio jungtimis: laiko intervalas nelūžta per pusę.
  if (sameDay) return capitalize(`${formatDateTimeWithWeekday(from)}⁠–⁠${formatTime(to)}`);
  return `${formatDateTime(from)} – ${formatDateTime(to)}`;
}

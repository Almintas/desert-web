'use client';

const PREFIX = 'dw-checkout-request:';

function uuidV4(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // randomUUID veikia tik saugiame kontekste (https / localhost)
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Vieno pateikimo bandymo ID (POST /orders clientRequestId). Laikomas sessionStorage, kad
 * pakartojus (dvigubas paspaudimas, dingęs atsakymas, perkrautas puslapis) būtų siunčiamas tas
 * pats ir API grąžintų jau sukurtą užsakymą. Naujas sugeneruojamas po sėkmės.
 */
export function getRequestId(windowId: string): string {
  try {
    const stored = sessionStorage.getItem(PREFIX + windowId);
    if (stored) return stored;
  } catch {
    // be sessionStorage: ID gyvena tik šiame puslapyje
  }
  const id = uuidV4();
  try {
    sessionStorage.setItem(PREFIX + windowId, id);
  } catch {
    // ignoruojam
  }
  return id;
}

export function resetRequestId(windowId: string): string {
  try {
    sessionStorage.removeItem(PREFIX + windowId);
  } catch {
    // ignoruojam
  }
  return getRequestId(windowId);
}

export function forgetRequestId(windowId: string): void {
  try {
    sessionStorage.removeItem(PREFIX + windowId);
  } catch {
    // ignoruojam
  }
}

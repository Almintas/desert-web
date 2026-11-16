import type { SaleWindowStatus } from './enums';

export interface SaleWindowTiming {
  status: SaleWindowStatus;
  opensAt: Date | string;
  closesAt: Date | string;
}

/**
 * Langas atidarytas, kai jis paskelbtas ir dabartinis laikas yra [opensAt, closesAt).
 * Backendas TURI tai tikrinti kiekvieno užsakymo metu; frontendas tik rodo.
 */
export function isSaleWindowOpen(saleWindow: SaleWindowTiming, now: Date = new Date()): boolean {
  if (saleWindow.status !== 'published') return false;
  const t = now.getTime();
  return new Date(saleWindow.opensAt).getTime() <= t && t < new Date(saleWindow.closesAt).getTime();
}

export type SaleWindowPhase = 'draft' | 'cancelled' | 'upcoming' | 'open' | 'closed';

export function getSaleWindowPhase(saleWindow: SaleWindowTiming, now: Date = new Date()): SaleWindowPhase {
  if (saleWindow.status === 'draft' || saleWindow.status === 'cancelled') return saleWindow.status;
  const t = now.getTime();
  if (t < new Date(saleWindow.opensAt).getTime()) return 'upcoming';
  if (t < new Date(saleWindow.closesAt).getTime()) return 'open';
  return 'closed';
}

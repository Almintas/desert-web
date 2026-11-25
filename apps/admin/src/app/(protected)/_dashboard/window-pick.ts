import type { AdminSaleWindowDto, AdminSaleWindowItemDto } from '@desert-web/shared';

const time = (iso: string) => new Date(iso).getTime();

/**
 * Apžvalgos langas: atidarytas (anksčiausiai atidarytas), kitaip artimiausias paskelbtas
 * būsimas, kitaip naujausias (pagal atidarymo laiką) neatšauktas. Atšaukti nerodomi.
 */
export function pickDashboardWindow(windows: AdminSaleWindowDto[]): AdminSaleWindowDto | null {
  const byOpensAsc = [...windows].sort((a, b) => time(a.opensAt) - time(b.opensAt));
  return (
    byOpensAsc.find((w) => w.phase === 'open') ??
    byOpensAsc.find((w) => w.phase === 'upcoming') ??
    byOpensAsc.reverse().find((w) => w.phase !== 'cancelled') ??
    null
  );
}

export type StockLevel = 'sold-out' | 'low' | 'ok';

/** Išparduota (0) arba mažai liko (≤ 20 % kiekio, bet ne mažiau nei 3 vnt. riba). */
export function stockLevel(
  item: Pick<AdminSaleWindowItemDto, 'quantityAvailable' | 'quantityTotal'>,
): StockLevel {
  if (item.quantityAvailable <= 0) return 'sold-out';
  const threshold = Math.max(3, Math.ceil(item.quantityTotal * 0.2));
  return item.quantityAvailable <= threshold ? 'low' : 'ok';
}

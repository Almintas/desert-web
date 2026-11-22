import type { PublicSaleWindowItemDto } from '@desert-web/shared';
import { maxQuantity } from './cart-logic';
import { LOW_STOCK_THRESHOLD } from './shop';

type StockItem = Pick<PublicSaleWindowItemDto, 'quantityAvailable'>;

/** Likučio tekstas kortelėje ir užsakymo puslapyje. */
export function stockText({ quantityAvailable }: StockItem): string {
  if (quantityAvailable === 0) return 'Išparduota';
  if (quantityAvailable <= LOW_STOCK_THRESHOLD) return `Liko ${quantityAvailable}`;
  return 'Yra';
}

/** CSS klasės likučio tekstui (`stock low`, `stock none`). */
export function stockClass({ quantityAvailable }: StockItem): string {
  if (quantityAvailable === 0) return 'stock none';
  if (quantityAvailable <= LOW_STOCK_THRESHOLD) return 'stock low';
  return 'stock';
}

/** Paaiškinimas, kai pasiektas didžiausias kiekis; null, jei dar galima pridėti. */
export function limitHint(
  item: Pick<PublicSaleWindowItemDto, 'quantityAvailable' | 'maxPerOrder'>,
  quantity: number,
): string | null {
  const max = maxQuantity(item);
  if (quantity === 0 || quantity < max) return null;
  return item.maxPerOrder && item.maxPerOrder < item.quantityAvailable
    ? `Vienu užsakymu daugiausia ${item.maxPerOrder} vnt.`
    : 'Daugiau neturime';
}

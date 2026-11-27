import type { PublicSaleWindowDto, PublicSaleWindowItemDto } from '@desert-web/shared';
import { describe, expect, it } from 'vitest';
import { adjustCart, maxQuantity } from './cart-logic';
import { limitHint } from './item-status';

function item(variantId: string, quantityAvailable: number): PublicSaleWindowItemDto {
  return {
    productId: `p-${variantId}`,
    variantId,
    productName: 'Makaronai',
    productSlug: 'makaronai',
    variantName: `${variantId} vnt.`,
    description: '',
    allergens: [],
    imageUrl: null,
    images: [],
    priceCents: 1200,
    quantityAvailable,
    giftWrapAllowed: true,
  };
}

function saleWindow(items: PublicSaleWindowItemDto[]): PublicSaleWindowDto {
  return {
    id: 'w1',
    title: 'Langas',
    phase: 'open',
    opensAt: '2026-12-01T08:00:00.000Z',
    closesAt: '2026-12-03T08:00:00.000Z',
    fulfillment: { pickupAvailable: true, deliveryAvailable: false },
    giftWrap: null,
    items,
  };
}

describe('krepšelio ribos: tik likutis (limitų pirkėjui nėra)', () => {
  it('maxQuantity lygus likučiui', () => {
    expect(maxQuantity(item('6', 40))).toBe(40);
    expect(maxQuantity(item('6', 0))).toBe(0);
  });

  it('limitHint: tik kai į krepšelį įdėtas visas likutis', () => {
    expect(limitHint(item('6', 40), 39)).toBeNull();
    expect(limitHint(item('6', 40), 40)).toBe('Daugiau neturime');
  });

  it('adjustCart: didelis kiekis paliekamas, kol užtenka likučio; kitaip sumažinamas', () => {
    const w = saleWindow([item('6', 30), item('12', 5)]);
    const result = adjustCart(
      [
        { variantId: '6', quantity: 25, label: 'Makaronai 6 vnt.' },
        { variantId: '12', quantity: 8, label: 'Makaronai 12 vnt.' },
      ],
      w,
    );
    expect(result.lines.map((l) => l.quantity)).toEqual([25, 5]);
    expect(result.changes).toEqual(['Makaronai 12 vnt.: liko tik 5, kiekis sumažintas']);
  });

  it('adjustCart: serverio `allowed` (INSUFFICIENT_STOCK) riboja kiekį', () => {
    const w = saleWindow([item('6', 30)]);
    const result = adjustCart([{ variantId: '6', quantity: 10, label: 'Makaronai 6 vnt.' }], w, [
      { variantId: '6', requested: 10, allowed: 4 },
    ]);
    expect(result.lines[0]!.quantity).toBe(4);
    expect(result.changes).toEqual(['Makaronai 6 vnt.: liko tik 4, kiekis sumažintas']);
  });
});

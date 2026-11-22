import {
  canGiftWrap,
  type OrderItemProblemDto,
  type PublicSaleWindowDto,
  type PublicSaleWindowItemDto,
} from '@desert-web/shared';

/** Krepšelio eilutė. `label` saugomas, kad galėtume pranešti ir apie dingusią prekę. */
export interface CartLine {
  variantId: string;
  quantity: number;
  label: string;
  /** Kiek vienetų supakuoti kaip dovaną (1..quantity); nėra arba 0: nepakuojama. */
  giftWrapQuantity?: number;
}

/** Eilutės pakavimo kiekis, apribotas iki [0, quantity]. */
export const giftWrapQuantityOf = (line: Pick<CartLine, 'quantity' | 'giftWrapQuantity'>) =>
  Math.max(0, Math.min(line.giftWrapQuantity ?? 0, line.quantity));

/** Eilutė su nurodytu pakavimo kiekiu (0: laukas išimamas, kad localStorage liktų švarus). */
export function withGiftWrap(line: CartLine, giftWrapQuantity: number): CartLine {
  const { giftWrapQuantity: _drop, ...rest } = line;
  const g = Math.max(0, Math.min(Math.trunc(giftWrapQuantity), line.quantity));
  return g > 0 ? { ...rest, giftWrapQuantity: g } : rest;
}

/** Ar dvi eilutės sutampa (kiekis, pavadinimas ir pakavimas). */
export const sameLine = (a: CartLine, b: CartLine | undefined) =>
  !!b &&
  a.variantId === b.variantId &&
  a.quantity === b.quantity &&
  a.label === b.label &&
  giftWrapQuantityOf(a) === giftWrapQuantityOf(b);

export const itemLabel = (item: Pick<PublicSaleWindowItemDto, 'productName' | 'variantName'>) =>
  `${item.productName} ${item.variantName}`;

/** Kiek šios prekės galima įdėti į krepšelį: min(likutis, limitas užsakymui). */
export function maxQuantity(
  item: Pick<PublicSaleWindowItemDto, 'quantityAvailable' | 'maxPerOrder'>,
): number {
  return Math.max(
    0,
    Math.min(item.quantityAvailable, item.maxPerOrder ?? Number.POSITIVE_INFINITY),
  );
}

export interface CartAdjustment {
  lines: CartLine[];
  /** Ką tiksliai pakeitėm (lietuviškai, rodoma pirkėjui). Tuščias: nieko nekeista. */
  changes: string[];
}

/**
 * Suderina krepšelį su langu: pašalina prekes, kurių lange nėra, ir sumažina kiekius iki
 * likučio ir limito užsakymui. `problems` (iš API klaidos `details.items`) papildomai
 * riboja kiekį: pvz., MAX_PER_CUSTOMER_EXCEEDED, kurio langas neparodo.
 *
 * Dovanų pakavimas tyliai apribojamas iki kiekio, o jei lange jis išjungtas ar prekė jo
 * neleidžia, išimamas (be pranešimo: kiekiai ir prekės nesikeičia).
 */
export function adjustCart(
  lines: CartLine[],
  window: PublicSaleWindowDto,
  problems: OrderItemProblemDto[] = [],
): CartAdjustment {
  const items = new Map(window.items.map((i) => [i.variantId, i]));
  const allowedByProblem = new Map(problems.map((p) => [p.variantId, p.allowed]));
  const result: CartLine[] = [];
  const changes: string[] = [];

  for (const line of lines) {
    const item = items.get(line.variantId);
    if (!item) {
      changes.push(`${line.label}: prekė nebeparduodama, pašalinta iš krepšelio`);
      continue;
    }
    const label = itemLabel(item);
    const available = item.quantityAvailable;
    const perOrder = item.maxPerOrder ?? Number.POSITIVE_INFINITY;
    const perCustomer = allowedByProblem.get(line.variantId) ?? Number.POSITIVE_INFINITY;
    const cap = Math.max(0, Math.min(available, perOrder, perCustomer));

    const giftWrap = (l: CartLine) =>
      withGiftWrap(l, canGiftWrap(window, item) ? giftWrapQuantityOf(l) : 0);

    if (line.quantity <= cap) {
      result.push(giftWrap({ ...line, label }));
      continue;
    }
    if (cap === 0) {
      changes.push(
        available === 0
          ? `${label}: išparduota, pašalinta iš krepšelio`
          : perCustomer === 0
            ? `${label}: šios prekės jau užsakėte daugiausiai galimą kiekį, pašalinta iš krepšelio`
            : `${label}: nebegalima užsakyti, pašalinta iš krepšelio`,
      );
      continue;
    }
    // Kuris apribojimas lėmė kiekį (pirmas, lygus cap).
    const reason =
      cap === available
        ? `liko tik ${available}`
        : cap === perCustomer
          ? `jums dar galima užsakyti tik ${perCustomer} vnt.`
          : `vienu užsakymu galima ne daugiau kaip ${perOrder} vnt.`;
    changes.push(`${label}: ${reason}, kiekis sumažintas`);
    result.push(giftWrap({ ...line, label, quantity: cap }));
  }
  return { lines: result, changes };
}

/**
 * Po GIFT_WRAP_UNAVAILABLE: išima pakavimą nurodytoms eilutėms (kiekiai nesikeičia) ir
 * praneša, kurioms. Kitos eilutės suderinamos su (atnaujintu) langu kaip įprasta.
 */
export function removeGiftWrap(
  lines: CartLine[],
  window: PublicSaleWindowDto,
  variantIds: string[],
): CartAdjustment {
  const ids = new Set(variantIds);
  const changes: string[] = [];
  const stripped = lines.map((l) => {
    if (!ids.has(l.variantId) || giftWrapQuantityOf(l) === 0) return l;
    changes.push(`${l.label}: supakuoti kaip dovaną nebegalima, pakavimas pašalintas`);
    return withGiftWrap(l, 0);
  });
  const adjusted = adjustCart(stripped, window);
  return { lines: adjusted.lines, changes: [...changes, ...adjusted.changes] };
}

export interface CartTotals {
  /** Vienetų skaičius. */
  count: number;
  /** Prekių suma (be pakavimo). */
  itemsCents: number;
  /** Kiek vienetų supakuoti kaip dovaną. */
  giftWrapCount: number;
  giftWrapCents: number;
  /** itemsCents + giftWrapCents. */
  totalCents: number;
}

/** Sumos pagal dabartines lango kainas (pakavimas skaičiuojamas tik kur jis galimas). */
export function cartTotals(lines: CartLine[], window: PublicSaleWindowDto | null): CartTotals {
  const items = new Map(window?.items.map((i) => [i.variantId, i]) ?? []);
  const giftWrapPrice = window?.giftWrap?.priceCents ?? 0;
  let count = 0;
  let itemsCents = 0;
  let giftWrapCount = 0;
  for (const l of lines) {
    const item = items.get(l.variantId);
    count += l.quantity;
    itemsCents += (item?.priceCents ?? 0) * l.quantity;
    if (window && canGiftWrap(window, item)) giftWrapCount += giftWrapQuantityOf(l);
  }
  const giftWrapCents = giftWrapCount * giftWrapPrice;
  return {
    count,
    itemsCents,
    giftWrapCount,
    giftWrapCents,
    totalCents: itemsCents + giftWrapCents,
  };
}

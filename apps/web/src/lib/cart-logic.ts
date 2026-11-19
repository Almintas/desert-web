import type {
  OrderItemProblemDto,
  PublicSaleWindowDto,
  PublicSaleWindowItemDto,
} from '@desert-web/shared';

/** Krepšelio eilutė. `label` saugomas, kad galėtume pranešti ir apie dingusią prekę. */
export interface CartLine {
  variantId: string;
  quantity: number;
  label: string;
}

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

    if (line.quantity <= cap) {
      result.push({ ...line, label });
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
    result.push({ ...line, label, quantity: cap });
  }
  return { lines: result, changes };
}

export function cartTotals(lines: CartLine[], window: PublicSaleWindowDto | null) {
  const prices = new Map(window?.items.map((i) => [i.variantId, i.priceCents]) ?? []);
  let count = 0;
  let totalCents = 0;
  for (const l of lines) {
    count += l.quantity;
    totalCents += (prices.get(l.variantId) ?? 0) * l.quantity;
  }
  return { count, totalCents };
}

/**
 * Puslapių adresai su lango ir prekės parametrais. Be `server-only`: naudojama ir kliento
 * komponentuose (kortelė, krepšelio juosta).
 */

/** Query parametras, kuriuo pasirenkamas vienas iš kelių atidarytų langų. */
export const WINDOW_PARAM = 'langas';

/** Query parametras užsakymo puslapyje: prekė (varianto ID), kurią pirkėjas atsidarė. */
export const PRODUCT_PARAM = 'preke';

/** Puslapio adresas konkrečiam langui (be parametro, jei atidarytas tik vienas). */
export function windowHref(path: string, windowId: string, openCount: number): string {
  return openCount > 1 ? `${path}?${WINDOW_PARAM}=${encodeURIComponent(windowId)}` : path;
}

/** Užsakymo puslapis (su `?langas=`, kai atidaryti keli langai), pasirinktinai su preke. */
export function checkoutHref(windowId: string, openCount: number, variantId?: string): string {
  const params = new URLSearchParams();
  if (openCount > 1) params.set(WINDOW_PARAM, windowId);
  if (variantId) params.set(PRODUCT_PARAM, variantId);
  const query = params.toString();
  return query ? `/uzsakymas?${query}` : '/uzsakymas';
}

/**
 * Kur veda krepšelio juostos suvestinė (visa juosta, išskyrus „Užsakyti“): atgal į paskutinę
 * užsakymo puslapyje atidarytą prekę. Jei jos nebėra lange, į paskiausiai į krepšelį įdėtą prekę
 * (nauja eilutė pridedama krepšelio gale), o jei ir tokios nėra, į įprastą užsakymą.
 */
export function cartBarHref({
  windowId,
  openCount,
  itemVariantIds,
  lastProductId,
  cartLines,
}: {
  windowId: string;
  openCount: number;
  /** Dabartinio lango prekės (variantų ID). */
  itemVariantIds: readonly string[];
  /** Paskutinė užsakymo puslapyje rodyta prekė (sessionStorage) arba null. */
  lastProductId: string | null;
  /** Krepšelio eilutės ta tvarka, kuria buvo pridėtos. */
  cartLines: readonly { variantId: string; quantity: number }[];
}): string {
  const inWindow = (id: string) => itemVariantIds.includes(id);
  const target =
    lastProductId !== null && inWindow(lastProductId)
      ? lastProductId
      : cartLines.findLast((l) => l.quantity > 0 && inWindow(l.variantId))?.variantId;
  return checkoutHref(windowId, openCount, target);
}

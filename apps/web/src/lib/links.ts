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

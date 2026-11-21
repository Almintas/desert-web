// Pavadinimas ir pardavėjo duomenys bendri su API laiškais: žr. packages/shared/src/shop.ts.
export { SHOP_NAME } from '@desert-web/shared';

export const SHOP_DESCRIPTION =
  'Rankų darbo makaronai ir kiti desertai. Užsakymai priimami tik pardavimo metu, atsiimama patiems.';

/** Vienintelis apmokėjimo būdas (internetinių mokėjimų kol kas nėra). */
export const PAYMENT_TEXT = 'Apmokėsite atsiimdami užsakymą.';

/** „Liko N“ rodom tik tada, kai likutis ne didesnis už šį skaičių. */
export const LOW_STOCK_THRESHOLD = 10;

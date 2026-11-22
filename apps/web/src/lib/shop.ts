// Pavadinimas, pardavėjo duomenys ir apmokėjimo tekstas (PAYMENT_TEXT) bendri su API laiškais:
// žr. packages/shared/src/shop.ts.
export { SHOP_NAME } from '@desert-web/shared';

/**
 * Smulki eilutė po logotipu (antraštėje ir dalinimosi paveikslėlyje). Tuščia eilutė ją paslepia.
 * Rašoma mažosiomis raidėmis.
 */
export const SHOP_LOGO_SUBLINE = 'rankų darbo';

/** Pagrindinio puslapio šūkis (h1) ir antra eilutė po juo. */
export const SHOP_TAGLINE = 'Tokių macarons niekur kitur nerasite.';
export const SHOP_SUBTAGLINE = 'Rankų darbo, kepami mažais kiekiais – tik pardavimo dienomis.';

export const SHOP_DESCRIPTION =
  'Rankų darbo macarons ir kiti desertai. Užsakymai priimami tik pardavimo metu, atsiimama patiems.';

/** „Liko N“ rodom tik tada, kai likutis ne didesnis už šį skaičių. */
export const LOW_STOCK_THRESHOLD = 10;

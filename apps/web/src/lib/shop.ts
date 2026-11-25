// Pavadinimas ir apmokėjimo tekstas (PAYMENT_TEXT) bendri su API laiškais: žr.
// packages/shared/src/shop.ts. Pardavėjo duomenys, socialiniai tinklai ir pagrindinio puslapio
// tekstai keičiami admin nustatymuose (žr. shop-info.ts).
export { SHOP_NAME } from '@desert-web/shared';

/**
 * Smulki eilutė po logotipu (antraštėje ir dalinimosi paveikslėlyje). Tuščia eilutė ją paslepia.
 * Rašoma mažosiomis raidėmis.
 */
export const SHOP_LOGO_SUBLINE = 'rankų darbo';

export const SHOP_DESCRIPTION =
  'Rankų darbo macarons ir kiti desertai. Užsakymai priimami tik pardavimo metu, atsiimama patiems.';

/** „Liko N“ rodom tik tada, kai likutis ne didesnis už šį skaičių. */
export const LOW_STOCK_THRESHOLD = 10;

import type { SocialLinks } from './social';

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

/**
 * Socialinių tinklų ikonos poraštėje. Kol kas tai laikini adresai, vedantys į tinklų pagrindinius
 * puslapius: pakeisk juos parduotuvės profilių URL. Tuščia eilutė tą ikoną paslepia (visos
 * tuščios → ikonų eilutės nėra).
 */
export const SOCIAL_LINKS: SocialLinks = {
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  tiktok: '',
};

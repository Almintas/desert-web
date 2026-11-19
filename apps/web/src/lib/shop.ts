/** Parduotuvės pavadinimas (antraštė, metaduomenys, OG). */
export const SHOP_NAME = 'Desert Web';

export const SHOP_DESCRIPTION =
  'Rankų darbo makaronai ir kiti desertai. Užsakymai priimami tik pardavimo metu, atsiimama patiems.';

/**
 * Pardavėjo duomenys: rodomi poraštėje ir privatumo puslapyje.
 * TODO: prieš paleidžiant įrašyti tikrą pardavėjo vardą (ar įmonę) ir kontaktus.
 */
export const SELLER = {
  name: 'TODO: pardavėjo vardas arba įmonė',
  email: 'todo@example.com',
  phone: '+370 600 00000',
} as const;

/** Vienintelis apmokėjimo būdas (internetinių mokėjimų kol kas nėra). */
export const PAYMENT_TEXT = 'Apmokėsite atsiimdami užsakymą.';

/** „Liko N“ rodom tik tada, kai likutis ne didesnis už šį skaičių. */
export const LOW_STOCK_THRESHOLD = 10;

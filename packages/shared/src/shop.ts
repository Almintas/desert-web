/** Parduotuvės pavadinimas (antraštė, metaduomenys, OG, laiškai). */
export const SHOP_NAME = 'Vincento Macarons';

/**
 * Vienintelis apmokėjimo būdas (internetinių mokėjimų kol kas nėra). Vienas tekstas užsakymo
 * formoje, patvirtinimo puslapyje ir laiškuose pirkėjui.
 */
export const PAYMENT_TEXT = 'Apmokėjimas atsiimant.';

export const SELLER_FIELDS = ['name', 'businessId', 'address', 'email', 'phone'] as const;
export type SellerField = (typeof SELLER_FIELDS)[number];
export type SellerDetails = Readonly<Record<SellerField, string>>;

/**
 * Pardavėjo duomenys: rodomi poraštėje, privatumo puslapyje, užsakymo formoje ir laiškuose
 * (Reply-To pirkėjui).
 *
 * Tuščia eilutė reiškia TODO (dar neužpildyta): toks laukas niekur nerodomas, o produkcinis
 * web build (VERCEL_ENV=production) nepraeina, kol yra bent vienas TODO laukas
 * (žr. sellerTodoFields ir apps/web/next.config.ts). Preview ir vietiniai buildai veikia.
 */
export const SELLER: SellerDetails = {
  /** Vardas ir pavardė (individuali veikla) arba įmonės pavadinimas. TODO */
  name: '',
  /** Individualios veiklos pažymos Nr. arba įmonės kodas. TODO */
  businessId: '',
  /** Adresas. TODO */
  address: '',
  /** El. paštas pirkėjams (ir Reply-To laiškuose). TODO */
  email: '',
  /** Telefonas, pvz., +370 600 12345. TODO */
  phone: '',
};

export const SELLER_FIELD_LABELS: Record<SellerField, string> = {
  name: 'Pardavėjas',
  businessId: 'Individualios veiklos pažymos Nr. / įmonės kodas',
  address: 'Adresas',
  email: 'El. paštas',
  phone: 'Telefonas',
};

/** Dar neužpildyti (TODO) pardavėjo laukai. */
export function sellerTodoFields(seller: SellerDetails = SELLER): SellerField[] {
  return SELLER_FIELDS.filter((field) => seller[field].trim().length === 0);
}

/** Pardavėjo vardas rodymui: kol jis TODO, rodomas parduotuvės pavadinimas. */
export function sellerDisplayName(seller: SellerDetails = SELLER): string {
  return seller.name.trim() || SHOP_NAME;
}

/** `tel:` nuoroda iš rodomo telefono numerio („+370 600 12345“ → „tel:+37060012345“). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

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

/** Socialiniai tinklai, kurių ikonas moka rodyti poraštė (ši tvarka = rodymo tvarka). */
export const SOCIAL_NETWORKS = ['facebook', 'instagram', 'tiktok'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
/** Kiekvieno tinklo profilio URL; tuščia eilutė tą ikoną paslepia. */
export type SocialLinks = Readonly<Record<SocialNetwork, string>>;

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

/** Kokio domeno adresą galima įvesti kiekvienam tinklui (su www arba be). */
export const SOCIAL_DOMAINS: Record<SocialNetwork, string> = {
  facebook: 'facebook.com',
  instagram: 'instagram.com',
  tiktok: 'tiktok.com',
};

/**
 * Parduotuvės informacija, kurią adminas keičia nustatymuose (be deploy): pardavėjo duomenys,
 * socialiniai tinklai ir pagrindinio puslapio tekstai. Tuščia eilutė reiškia „nerodoma“.
 */
export interface ShopInfo {
  seller: SellerDetails;
  social: SocialLinks;
  texts: Readonly<{ tagline: string; subtagline: string }>;
}

/**
 * Numatytosios reikšmės: galioja, kol nustatymuose parduotuvės informacija dar neišsaugota
 * (ir web, kai API nepasiekiamas). Pačios reikšmės keičiamos admin nustatymuose, ne čia.
 */
export const DEFAULT_SHOP_INFO: ShopInfo = {
  seller: {
    /** Vardas ir pavardė (individuali veikla) arba įmonės pavadinimas. */
    name: 'Ieva Speciūtė',
    /** IV pažymos Nr. arba įmonės kodas: tik numeris (etiketę prideda rodymas). */
    businessId: '',
    address: 'Kovo 11-osios g. 33, Kaunas',
    /** El. paštas pirkėjams (ir Reply-To laiškuose). */
    email: 'ieva@vincentomacarons.lt',
    phone: '',
  },
  social: {
    facebook: 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
    tiktok: '',
  },
  texts: {
    tagline: 'Tokių macarons niekur kitur nerasite.',
    subtagline: 'Rankų darbo, kepami mažais kiekiais – tik pardavimo dienomis.',
  },
};

/**
 * Atsiėmimas: viena vieta ir vienas laikas visiems langams (laisvas tekstas, keičiamas admin
 * nustatymuose). Pirkėjams rodoma „Atsiėmimas: {location}, {hours}“ (žr. formatPickupInfo).
 */
export interface PickupInfo {
  location: string;
  hours: string;
}

/** Numatytoji vieta, kai nustatymuose nėra nei atsiėmimo vietos, nei pardavėjo adreso. */
export const DEFAULT_PICKUP_LOCATION = 'Kovo 11-osios g. 33, Kaunas';
/** Numatytasis atsiėmimo laikas (kol nustatymuose neišsaugotas). */
export const DEFAULT_PICKUP_HOURS = '17:00–20:00';

/**
 * Numatytasis atsiėmimas: vieta yra pardavėjo adresas (tuščias: DEFAULT_PICKUP_LOCATION),
 * laikas DEFAULT_PICKUP_HOURS.
 */
export function defaultPickupInfo(seller: Pick<SellerDetails, 'address'>): PickupInfo {
  return {
    location: seller.address.trim() || DEFAULT_PICKUP_LOCATION,
    hours: DEFAULT_PICKUP_HOURS,
  };
}

/** Kol nustatymai neišsaugoti ar API nepasiekiamas (web). */
export const DEFAULT_PICKUP_INFO: PickupInfo = defaultPickupInfo(DEFAULT_SHOP_INFO.seller);

/** „Kovo 11-osios g. 33, Kaunas, 17:00–20:00“ (po etiketės „Atsiėmimas:“). */
export function formatPickupInfo(pickup: PickupInfo): string {
  return `${pickup.location}, ${pickup.hours}`;
}

export const SELLER_FIELD_LABELS: Record<SellerField, string> = {
  name: 'Pardavėjas',
  businessId: 'Individualios veiklos pažymos Nr. / įmonės kodas',
  address: 'Adresas',
  email: 'El. paštas',
  phone: 'Telefonas',
};

/** Trumpa businessId etiketė prieš numerį (poraštė, privatumo puslapis). */
export const SELLER_BUSINESS_ID_LABEL = 'IV pažymos Nr.';

/** Dar neužpildyti pardavėjo laukai (apžvalgos įspėjimui). */
export function sellerTodoFields(seller: SellerDetails): SellerField[] {
  return SELLER_FIELDS.filter((field) => seller[field].trim().length === 0);
}

/** Pardavėjo vardas rodymui: kol jis neužpildytas, rodomas parduotuvės pavadinimas. */
export function sellerDisplayName(seller: SellerDetails): string {
  return seller.name.trim() || SHOP_NAME;
}

/** `tel:` nuoroda iš rodomo telefono numerio („+370 600 12345“ → „tel:+37060012345“). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

import type { AdminProductDto } from '@desert-web/shared';

/** Server Action atsakymas formai (sėkmės atveju vyksta redirect, todėl jo čia nėra). */
export interface ProductFormState {
  /** Bendra klaida formos viršuje. */
  error?: string;
  /**
   * Laukų klaidos pagal kelią, kaip API `issues` (pvz., "name", "variants.0.priceCents").
   * Kiekvienam keliui pirmas pranešimas.
   */
  fieldErrors?: Record<string, string>;
  /** Sukurto produkto ID, kai naršyklė dar turi įkelti pasirinktas nuotraukas. */
  createdId?: string;
  /** VARIANT_IN_USE: langai, kuriuose naudojami šalinami variantai. */
  saleWindows?: { id: string; title: string }[];
}

/** Formos laukų pavadinimai (FormData raktai). Variantai: variants.<i>.id|name|price. */
export const FIELD = {
  name: 'name',
  category: 'category',
  description: 'description',
  allergens: 'allergens',
  specialOrderEnabled: 'specialOrder.enabled',
  specialOrderMinQuantity: 'specialOrder.minQuantity',
  isActive: 'isActive',
  /** "1", jei kuriant pasirinkta nuotraukų (žr. saveProductAction). */
  withImages: 'withImages',
} as const;

export type ProductFormInitial = Pick<
  AdminProductDto,
  'name' | 'category' | 'description' | 'allergens' | 'variants' | 'specialOrder' | 'isActive'
>;

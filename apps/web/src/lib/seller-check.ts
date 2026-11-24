import {
  SELLER,
  SELLER_FIELD_LABELS,
  type SellerDetails,
  sellerTodoFields,
} from '@desert-web/shared';

/**
 * Ar Vercel production build turi nepraeiti, kol pardavėjo duomenys neužpildyti.
 * Laikinai false: svetainė diegiama ir be jų (vietoje pardavėjo rodomas parduotuvės
 * pavadinimas), o build loge lieka įspėjimas. Užpildžius SELLER (packages/shared/src/shop.ts),
 * grąžinkite true, kad tušti laukai vėl stabdytų produkcinį build'ą.
 */
export const BLOCK_PRODUCTION_WITHOUT_SELLER = false;

/**
 * Produkcinio build'o patikra (žr. next.config.ts): ar bent vienas SELLER laukas TODO, kai
 * VERCEL_ENV=production. Preview ir vietiniams buildams null. Grąžina pranešimą arba null.
 */
export function sellerBuildProblem(
  env: Readonly<Partial<Record<string, string>>> = process.env,
  seller: SellerDetails = SELLER,
): string | null {
  if (env.VERCEL_ENV !== 'production') return null;
  const todo = sellerTodoFields(seller);
  if (todo.length === 0) return null;
  return (
    'Seller details (SELLER in packages/shared/src/shop.ts) are not filled in. Missing: ' +
    todo.map((field) => `${field} (${SELLER_FIELD_LABELS[field]})`).join(', ') +
    '. Fill them in: the shop must show who the seller is.'
  );
}

/**
 * Ką daryti produkciniame build'e: `throw` (blokuoti), `warn` (tik įspėjimas) arba null
 * (viskas gerai).
 */
export function sellerBuildCheck(
  env: Readonly<Partial<Record<string, string>>> = process.env,
  seller: SellerDetails = SELLER,
  block: boolean = BLOCK_PRODUCTION_WITHOUT_SELLER,
): { action: 'throw' | 'warn'; message: string } | null {
  const message = sellerBuildProblem(env, seller);
  if (!message) return null;
  return block
    ? { action: 'throw', message: `Production build blocked: ${message}` }
    : { action: 'warn', message: `Warning: ${message}` };
}

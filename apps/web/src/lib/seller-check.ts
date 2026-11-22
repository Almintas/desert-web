import {
  SELLER,
  SELLER_FIELD_LABELS,
  type SellerDetails,
  sellerTodoFields,
} from '@desert-web/shared';

/**
 * Produkcinio build'o patikra (žr. next.config.ts): kol bent vienas SELLER laukas TODO,
 * Vercel production build nepraeina. Preview (VERCEL_ENV=preview) ir vietiniai buildai veikia.
 * Grąžina klaidos pranešimą arba null.
 */
export function sellerBuildError(
  env: Readonly<Partial<Record<string, string>>> = process.env,
  seller: SellerDetails = SELLER,
): string | null {
  if (env.VERCEL_ENV !== 'production') return null;
  const todo = sellerTodoFields(seller);
  if (todo.length === 0) return null;
  return (
    'Production build blocked: seller details (SELLER in packages/shared/src/shop.ts) are not ' +
    'filled in. Missing: ' +
    todo.map((field) => `${field} (${SELLER_FIELD_LABELS[field]})`).join(', ') +
    '. Fill them in before deploying to production (preview and local builds are not affected).'
  );
}

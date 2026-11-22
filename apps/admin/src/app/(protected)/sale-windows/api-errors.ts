import type { ApiError } from '@/lib/api';
import type { SaleWindowFormState } from './form-state';

/**
 * API klaida -> formos būsena. `variantIndex` leidžia prekės klaidą (pagal variantId)
 * parodyti prie atitinkamos lentelės eilutės.
 */
export function saleWindowApiErrorState(
  error: ApiError,
  variantIndex: (variantId: string) => number = () => -1,
): SaleWindowFormState {
  const body = (error.body ?? {}) as { variantId?: unknown };
  const index = typeof body.variantId === 'string' ? variantIndex(body.variantId) : -1;

  switch (error.code) {
    case 'PICKUP_INFO_REQUIRED':
      return {
        error: error.message,
        fieldErrors: Object.fromEntries(
          (Array.isArray((body as { missing?: unknown }).missing)
            ? ((body as { missing: string[] }).missing ?? [])
            : []
          )
            .filter((field) => field !== 'pickupAvailable')
            .map((field) => [`fulfillment.${field}`, 'Privaloma paskelbtam langui']),
        ),
      };
    case 'QUANTITY_BELOW_SOLD':
      return {
        error: 'Patikrink pažymėtus laukus.',
        fieldErrors: index >= 0 ? { [`items.${index}.quantityTotal`]: error.message } : {},
      };
    case 'PRODUCT_NOT_FOUND':
    case 'PRODUCT_INACTIVE':
    case 'VARIANT_NOT_FOUND':
      return {
        error: error.message,
        fieldErrors: index >= 0 ? { [`items.${index}.variantId`]: error.message } : {},
      };
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path] ??= issue.message;
  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'Patikrink pažymėtus laukus.', fieldErrors };
  }
  return { error: error.message };
}

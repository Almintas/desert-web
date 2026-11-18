'use server';

import {
  type AdminProductInput,
  adminProductInputSchema,
  type ProductDto,
  parseEurToCents,
  type VariantInUseErrorBody,
} from '@desert-web/shared';
import { redirect } from 'next/navigation';
import { ApiError, type ApiIssue, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import { FIELD, type ProductFormState } from './form-state';

const VARIANT_KEY = /^variants\.(\d+)\.name$/;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** Alergenų laukų klaidos (allergens.2) rodomos prie viso lauko. */
function fieldKey(path: string): string {
  return path.startsWith('allergens.') ? 'allergens' : path;
}

function addErrors(target: Record<string, string>, issues: ApiIssue[]): void {
  for (const issue of issues) {
    const key = fieldKey(issue.path);
    target[key] ??= issue.message;
  }
}

/**
 * FormData -> API įvestis. Kainos įvedamos tekstu („12,50“) ir verčiamos centais;
 * netinkamos kainos klaida grąžinama atskirai, o schemai perduodamas NaN.
 */
function readProductForm(formData: FormData): {
  input: Record<string, unknown>;
  priceErrors: Record<string, string>;
} {
  const priceErrors: Record<string, string> = {};
  const indexes = [...new Set([...formData.keys()].flatMap((k) => VARIANT_KEY.exec(k)?.[1] ?? []))]
    .map(Number)
    .sort((a, b) => a - b);

  const variants = indexes.map((formIndex, i) => {
    const prefix = `variants.${formIndex}`;
    const rawPrice = text(formData, `${prefix}.price`);
    const priceCents = parseEurToCents(rawPrice);
    if (priceCents === null) {
      priceErrors[`variants.${i}.priceCents`] = rawPrice.trim()
        ? 'Netinkama kaina (pvz., 12,50)'
        : 'Įvesk kainą';
    }
    const id = text(formData, `${prefix}.id`).trim();
    return {
      ...(id ? { id } : {}),
      name: text(formData, `${prefix}.name`),
      priceCents: priceCents ?? Number.NaN,
    };
  });

  const specialOrderEnabled = formData.get(FIELD.specialOrderEnabled) === 'on';
  const rawMin = text(formData, FIELD.specialOrderMinQuantity).trim();
  // Išjungus specialius užsakymus tuščias minimalus kiekis netrukdo išsaugoti.
  const minQuantity = rawMin ? Number(rawMin) : specialOrderEnabled ? Number.NaN : 1;

  return {
    input: {
      name: text(formData, FIELD.name),
      slug: text(formData, FIELD.slug),
      category: text(formData, FIELD.category),
      description: text(formData, FIELD.description),
      allergens: text(formData, FIELD.allergens)
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      variants,
      specialOrder: { enabled: specialOrderEnabled, minQuantity },
      isActive: formData.get(FIELD.isActive) === 'on',
    },
    priceErrors,
  };
}

function apiErrorState(error: ApiError): ProductFormState {
  switch (error.code) {
    case 'SLUG_TAKEN':
      return { error: 'Patikrink pažymėtus laukus.', fieldErrors: { slug: error.message } };
    case 'VARIANT_IN_USE': {
      const body = error.body as VariantInUseErrorBody;
      return { error: error.message, saleWindows: body.saleWindows ?? [] };
    }
    case 'VARIANT_NOT_FOUND':
      return {
        error: `${error.message}. Atnaujink puslapį: produktas galėjo būti pakeistas kitame lange.`,
      };
    case 'PRODUCT_NOT_FOUND':
      return { error: 'Produktas nerastas: galbūt jis buvo pašalintas.' };
  }
  const fieldErrors: Record<string, string> = {};
  addErrors(fieldErrors, error.issues);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'Patikrink pažymėtus laukus.', fieldErrors };
  }
  return { error: error.message };
}

/** Sukuria (productId = null) arba atnaujina produktą. Sėkmės atveju nukreipia į /products. */
export async function saveProductAction(
  productId: string | null,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const { input, priceErrors } = readProductForm(formData);
  const parsed = adminProductInputSchema.safeParse(input);
  const fieldErrors: Record<string, string> = { ...priceErrors };
  if (!parsed.success) {
    addErrors(
      fieldErrors,
      parsed.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
    );
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { error: 'Patikrink pažymėtus laukus.', fieldErrors };
  }

  const body: AdminProductInput = parsed.data;
  try {
    await apiFetch<ProductDto>(
      productId ? `/admin/products/${encodeURIComponent(productId)}` : '/admin/products',
      { method: productId ? 'PUT' : 'POST', body, token },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      return apiErrorState(error);
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  redirect(`/products?saved=${productId ? 'updated' : 'created'}`);
}

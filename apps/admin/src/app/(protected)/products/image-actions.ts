'use server';

import type {
  AdminProductDto,
  AdminProductImageDto,
  AttachProductImageInput,
  ProductImageUploadSignatureDto,
} from '@desert-web/shared';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';

export type ImageActionResult =
  | { ok: true; images: AdminProductImageDto[] }
  /** `images`: dabartinės nuotraukos, jei jas pavyko gauti po klaidos (sąrašui atnaujinti). */
  | { ok: false; error: string; code?: string; images?: AdminProductImageDto[] };

export type SignatureActionResult =
  { ok: true; signature: ProductImageUploadSignatureDto } | { ok: false; error: string };

const NETWORK_ERROR = 'Nepavyko susisiekti su serveriu. Bandyk vėliau.';

/** Kodai, po kurių sąrašas naršyklėje gali būti pasenęs: grąžinam naujausią. */
const RESYNC_CODES = new Set([
  'IMAGE_NOT_FOUND',
  'IMAGE_SET_MISMATCH',
  'IMAGE_LIMIT_REACHED',
  'DUPLICATE_IMAGE',
]);

async function adminToken(): Promise<string> {
  await requireAdmin();
  const token = await getSessionToken();
  if (!token) redirect('/login');
  return token;
}

function productPath(productId: string): string {
  return `/admin/products/${encodeURIComponent(productId)}`;
}

async function failure(error: unknown, productId: string, token: string) {
  if (!(error instanceof ApiError)) return { ok: false as const, error: NETWORK_ERROR };
  if (error.status === 401) redirect('/auth/clear');
  let images: AdminProductImageDto[] | undefined;
  if (error.code && RESYNC_CODES.has(error.code)) {
    images = await apiFetch<AdminProductDto>(productPath(productId), { token })
      .then((p) => p.images)
      .catch(() => undefined);
  }
  return { ok: false as const, error: error.message, code: error.code, images };
}

/** Pasirašyti parametrai tiesioginiam įkėlimui į Cloudinary (paslaptis lieka API). */
export async function getUploadSignatureAction(): Promise<SignatureActionResult> {
  const token = await adminToken();
  try {
    const signature = await apiFetch<ProductImageUploadSignatureDto>(
      '/admin/uploads/product-image-signature',
      { method: 'POST', token },
    );
    return { ok: true, signature };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      return { ok: false, error: error.message };
    }
    return { ok: false, error: NETWORK_ERROR };
  }
}

/** Perduoda Cloudinary atsakymą API (ten tikrinamas parašas, katalogas ir limitas). */
export async function attachImageAction(
  productId: string,
  upload: AttachProductImageInput,
): Promise<ImageActionResult> {
  const token = await adminToken();
  try {
    const product = await apiFetch<AdminProductDto>(`${productPath(productId)}/images`, {
      method: 'POST',
      body: upload,
      token,
    });
    return { ok: true, images: product.images };
  } catch (error) {
    return failure(error, productId, token);
  }
}

export async function removeImageAction(
  productId: string,
  imageId: string,
): Promise<ImageActionResult> {
  const token = await adminToken();
  try {
    const product = await apiFetch<AdminProductDto>(
      `${productPath(productId)}/images/${encodeURIComponent(imageId)}`,
      { method: 'DELETE', token },
    );
    return { ok: true, images: product.images };
  } catch (error) {
    return failure(error, productId, token);
  }
}

export async function reorderImagesAction(
  productId: string,
  imageIds: string[],
): Promise<ImageActionResult> {
  const token = await adminToken();
  try {
    const product = await apiFetch<AdminProductDto>(`${productPath(productId)}/images/order`, {
      method: 'PUT',
      body: { imageIds },
      token,
    });
    return { ok: true, images: product.images };
  } catch (error) {
    return failure(error, productId, token);
  }
}

import {
  type AttachProductImageInput,
  attachProductImageInputSchema,
  isAllowedProductImageFile,
  PRODUCT_IMAGE_MAX_BYTES,
  type ProductImageUploadSignatureDto,
} from '@desert-web/shared';

/**
 * Naršyklės pusės nuotraukų įkėlimas (naudoja ProductImages ir naujo produkto forma).
 * Tik klientiniams komponentams: naudoja XMLHttpRequest.
 */

export const MAX_MB = Math.round(PRODUCT_IMAGE_MAX_BYTES / (1024 * 1024));

export class UploadError extends Error {}

/**
 * Siunčia failą tiesiai į Cloudinary su pasirašytais parametrais (XMLHttpRequest, kad
 * matytųsi progresas). Parametrai siunčiami lygiai tokie, kokius pasirašė API.
 */
export function uploadToCloudinary(
  file: File,
  sig: ProductImageUploadSignatureDto,
  onProgress: (percent: number) => void,
): Promise<AttachProductImageInput> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', sig.apiKey);
    form.append('timestamp', String(sig.timestamp));
    form.append('signature', sig.signature);
    form.append('folder', sig.folder);
    form.append('allowed_formats', sig.allowedFormats);
    form.append('transformation', sig.transformation);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.uploadUrl);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new UploadError('Nepavyko susisiekti su Cloudinary.'));
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as Record<string, unknown>;
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = (body.error as { message?: unknown } | undefined)?.message;
        reject(
          new UploadError(
            typeof message === 'string'
              ? `Cloudinary atmetė failą: ${message}`
              : `Cloudinary atmetė failą (${xhr.status}).`,
          ),
        );
        return;
      }
      const parsed = attachProductImageInputSchema.safeParse({
        publicId: body.public_id,
        version: body.version,
        signature: body.signature,
        width: body.width,
        height: body.height,
        format: body.format,
        bytes: body.bytes,
        secureUrl: body.secure_url,
      });
      if (!parsed.success) {
        reject(new UploadError('Netikėtas Cloudinary atsakymas.'));
        return;
      }
      resolve(parsed.data);
    };
    xhr.send(form);
  });
}

/** Naršyklėje patikrina tipą ir dydį. Grąžina klaidos tekstą arba null. */
export function imageFileError(file: File): string | null {
  if (!isAllowedProductImageFile(file)) return 'Netinkamas formatas: tik JPG, PNG, WEBP arba HEIC.';
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return `Per didelis failas: daugiausia ${MAX_MB} MB.`;
  return null;
}

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Cloudinary atsakymo parašas (taip, kaip dokumentuoja Cloudinary ir skaičiuoja jų SDK
 * `verify_api_response_signature`): SHA-1 nuo `public_id=<id>&version=<v>` + API paslaptis,
 * hex. SDK funkcija paslaptį ima iš globalios konfigūracijos ir lygina ne pastovaus laiko
 * būdu, todėl skaičiuojam patys (testuose sutikrinta su SDK ir su žinomu vektoriumi).
 */
export function cloudinaryResponseSignature(
  publicId: string,
  version: number | string,
  apiSecret: string,
  algorithm: 'sha1' | 'sha256' = 'sha1',
): string {
  return createHash(algorithm)
    .update(`public_id=${publicId}&version=${version}${apiSecret}`)
    .digest('hex');
}

/** Pastovaus laiko palyginimas. SHA-256 parašas (64 hex) priimamas, jei paskyra jį naudoja. */
export function verifyCloudinaryResponseSignature(
  publicId: string,
  version: number,
  signature: string,
  apiSecret: string,
): boolean {
  const algorithm = signature.length === 64 ? 'sha256' : 'sha1';
  const expected = Buffer.from(
    cloudinaryResponseSignature(publicId, version, apiSecret, algorithm),
  );
  const actual = Buffer.from(signature.toLowerCase());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

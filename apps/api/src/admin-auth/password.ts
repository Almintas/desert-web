import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

/**
 * Slaptažodžių hash'ai su node:crypto scrypt (be native priklausomybių).
 * Formatas: scrypt$N$r$p$<salt base64url>$<hash base64url>. Parametrai saugomi kartu,
 * todėl ateityje juos galima didinti nesugadinant senų hash'ų.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** scrypt atminties poreikis ~128 * N * r baitų; numatytas maxmem (32 MiB) N=2^15 nepakanka. */
function maxmemFor(n: number, r: number): number {
  return 256 * n * r;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: maxmemFor(N, R),
  });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltStr, hashStr] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  // Apsauga nuo sugadintų / piktybiškų parametrų (pvz., milžiniško N).
  if (
    ![n, r, p].every(Number.isInteger) ||
    n < 2 ||
    n > 2 ** 20 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16
  ) {
    return false;
  }
  const salt = Buffer.from(saltStr, 'base64url');
  const expected = Buffer.from(hashStr, 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scryptAsync(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: maxmemFor(n, r),
  });
  return timingSafeEqual(actual, expected);
}

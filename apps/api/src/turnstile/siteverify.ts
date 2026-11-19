/** Cloudflare siteverify užklausos parametrai (form-urlencoded). */
export interface SiteverifyRequest {
  secret: string;
  response: string;
  remoteip?: string;
  /** Pakartojimai su tuo pačiu raktu nelaikomi pakartotiniu tokeno panaudojimu. */
  idempotencyKey?: string;
}

/** Cloudflare siteverify atsakymas (laukai, kurių mums reikia). */
export interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
  hostname?: string;
  action?: string;
}

/**
 * Kaip kviečiamas siteverify. Atskiras provider'is, kad Jest testuose jį būtų galima pakeisti
 * (jokių tikrų tinklo užklausų). Turi mesti klaidą, jei Cloudflare nepasiekiamas ar atsako ne 2xx.
 */
export type SiteverifyClient = (request: SiteverifyRequest) => Promise<SiteverifyResponse>;
export const SITEVERIFY_CLIENT = Symbol('SITEVERIFY_CLIENT');

export const SITEVERIFY_TIMEOUT_MS = 5_000;

export class SiteverifyHttpError extends Error {
  constructor(public readonly status: number) {
    super(`Cloudflare siteverify atsakė HTTP ${status}`);
  }
}

/** Numatytas klientas: fetch su 5 s laiko limitu. */
export function createFetchSiteverifyClient(url: string): SiteverifyClient {
  return async ({ secret, response, remoteip, idempotencyKey }) => {
    const body = new URLSearchParams({ secret, response });
    if (remoteip) body.set('remoteip', remoteip);
    if (idempotencyKey) body.set('idempotency_key', idempotencyKey);
    const res = await fetch(url, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!res.ok) throw new SiteverifyHttpError(res.status);
    return (await res.json()) as SiteverifyResponse;
  };
}

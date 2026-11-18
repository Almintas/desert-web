import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Pagal ką ribojami prisijungimai. Admin Next.js serveris kreipiasi į API iš savo IP, todėl
 * be šito visi adminai dalintųsi vienu limitu ir svetimas galėtų juos visus užblokuoti.
 * Jei užklausa turi teisingą INTERNAL_API_SECRET, pasitikim jos perduotu naršyklės IP;
 * kitu atveju naudojam req.ip (už Railway proxy, žr. configureApp).
 */
export function loginThrottleTracker(req: Request, internalSecret: string | undefined): string {
  const given = req.headers[INTERNAL_SECRET_HEADER];
  const clientIp = req.headers[CLIENT_IP_HEADER];
  if (
    internalSecret &&
    typeof given === 'string' &&
    secretMatches(given, internalSecret) &&
    typeof clientIp === 'string' &&
    isIP(clientIp) !== 0
  ) {
    return `client:${clientIp}`;
  }
  return `ip:${req.ip ?? 'unknown'}`;
}

import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

/** Request su nustatytu kliento IP (žr. clientIpMiddleware). */
export interface ClientIpRequest extends Request {
  /**
   * Tikras naršyklės IP: X-Client-IP, jei užklausa turi teisingą INTERNAL_API_SECRET
   * (ją siunčia admin ir web Next.js serveriai), kitaip req.ip.
   */
  clientIp?: string;
  /** 'forwarded': IP perdavė mūsų Next.js serveris; 'direct': req.ip. */
  clientIpSource?: 'forwarded' | 'direct';
}

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Kliento IP. Next.js serveriai kreipiasi į API iš savo IP, todėl jie perduoda naršyklės IP
 * antrašte X-Client-IP. Ja pasitikim TIK kartu su teisinga X-Internal-Secret (bendra
 * INTERNAL_API_SECRET): kitaip bet kas galėtų apsimesti bet kokiu IP. Be paslapties
 * naudojamas req.ip (už Railway proxy, žr. configureApp).
 */
export function resolveClientIp(
  req: Request,
  internalSecret: string | undefined,
): { ip: string; source: 'forwarded' | 'direct' } {
  const given = req.headers[INTERNAL_SECRET_HEADER];
  const clientIp = req.headers[CLIENT_IP_HEADER];
  if (
    internalSecret &&
    typeof given === 'string' &&
    secretMatches(given, internalSecret) &&
    typeof clientIp === 'string' &&
    isIP(clientIp) !== 0
  ) {
    return { ip: clientIp, source: 'forwarded' };
  }
  return { ip: req.ip ?? 'unknown', source: 'direct' };
}

/** Express middleware: nustato req.clientIp kiekvienai užklausai (ribojimams). */
export function clientIpMiddleware(internalSecret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { ip, source } = resolveClientIp(req, internalSecret);
    const r = req as ClientIpRequest;
    r.clientIp = ip;
    r.clientIpSource = source;
    next();
  };
}

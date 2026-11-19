import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';
/** Railway edge nustato pats (perrašo kliento siųstą reikšmę) viešoms užklausoms. */
export const REAL_IP_HEADER = 'x-real-ip';

export interface ClientIpOptions {
  internalSecret: string | undefined;
  /** Ar pasitikėti X-Real-IP, kai nėra patikimo X-Client-IP (Railway produkcijoje). */
  trustRealIp: boolean;
}

/** Request su nustatytu kliento IP (žr. clientIpMiddleware). */
export interface ClientIpRequest extends Request {
  /**
   * Tikras naršyklės IP: X-Client-IP, jei užklausa turi teisingą INTERNAL_API_SECRET
   * (ją siunčia admin ir web Next.js serveriai), kitaip req.ip.
   */
  clientIp?: string;
  /** 'forwarded': IP perdavė mūsų Next.js serveris; 'direct': X-Real-IP arba req.ip. */
  clientIpSource?: 'forwarded' | 'direct';
  /** Užklausa turi teisingą X-Internal-Secret (ją siuntė mūsų Next.js serveris). */
  internalClient?: boolean;
}

export function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Ar užklausa turi teisingą X-Internal-Secret (bendra INTERNAL_API_SECRET). */
export function hasInternalSecret(req: Request, internalSecret: string | undefined): boolean {
  const given = req.headers[INTERNAL_SECRET_HEADER];
  return !!internalSecret && typeof given === 'string' && secretMatches(given, internalSecret);
}

/**
 * Kliento IP. Next.js serveriai kreipiasi į API iš savo IP, todėl jie perduoda naršyklės IP
 * antrašte X-Client-IP. Ja pasitikim TIK kartu su teisinga X-Internal-Secret (bendra
 * INTERNAL_API_SECRET): kitaip bet kas galėtų apsimesti bet kokiu IP.
 *
 * Be paslapties (tiesioginė užklausa į API):
 * - Railway produkcijoje (`trustRealIp`): X-Real-IP, kurį Railway edge nustato pats ir
 *   kliento reikšmę perrašo. X-Forwarded-For netinka: Railway kelyje gali būti keli proxy
 *   šuoliai, todėl `trust proxy 1` kartais duotų vidinį Railway adresą.
 * - kitur: req.ip (`trust proxy 1`, žr. configureApp).
 */
export function resolveClientIp(
  req: Request,
  options: ClientIpOptions,
): { ip: string; source: 'forwarded' | 'direct' } {
  const clientIp = req.headers[CLIENT_IP_HEADER];
  if (
    hasInternalSecret(req, options.internalSecret) &&
    typeof clientIp === 'string' &&
    isIP(clientIp) !== 0
  ) {
    return { ip: clientIp, source: 'forwarded' };
  }
  if (options.trustRealIp) {
    const realIp = req.headers[REAL_IP_HEADER];
    const value = typeof realIp === 'string' ? realIp.trim() : '';
    if (isIP(value) !== 0) return { ip: value, source: 'direct' };
  }
  return { ip: req.ip ?? 'unknown', source: 'direct' };
}

/** Express middleware: nustato req.clientIp kiekvienai užklausai (ribojimams). */
export function clientIpMiddleware(options: ClientIpOptions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { ip, source } = resolveClientIp(req, options);
    const r = req as ClientIpRequest;
    r.clientIp = ip;
    r.clientIpSource = source;
    r.internalClient = hasInternalSecret(req, options.internalSecret);
    next();
  };
}

import type { Request } from 'express';
import { resolveClientIp } from '../common/client-ip';

/**
 * Pagal ką ribojami prisijungimai. Admin Next.js serveris kreipiasi į API iš savo IP, todėl
 * be šito visi adminai dalintųsi vienu limitu ir svetimas galėtų juos visus užblokuoti.
 * Jei užklausa turi teisingą INTERNAL_API_SECRET, pasitikim jos perduotu naršyklės IP;
 * kitu atveju naudojam req.ip (už Railway proxy, žr. configureApp).
 */
export function loginThrottleTracker(req: Request, internalSecret: string | undefined): string {
  const { ip, source } = resolveClientIp(req, internalSecret);
  return source === 'forwarded' ? `client:${ip}` : `ip:${ip}`;
}

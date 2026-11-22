import 'server-only';
import { headers } from 'next/headers';
import { webEnv } from './env';

/**
 * Antraštės kreipiantis į API pirkėjo vardu:
 * - X-Internal-Secret (INTERNAL_API_SECRET): produkcijoje API POST /orders priima tik su ja
 *   (403 FORBIDDEN_CLIENT be jos), nes API Railway pasiekiamas viešai;
 * - X-Client-IP: tikras naršyklės IP, kad API ribotų pagal pirkėją, o ne pagal Vercel IP.
 *
 * Be paslapties (vystant) antraščių nėra ir API riboja pagal Next.js serverio IP. Produkcijoje
 * be paslapties užsakymas į API nesiunčiamas iš viso (žr. webEnv().missingForOrders ir
 * uzsakymas/actions.ts); kitos užklausos (užsakymo peržiūra) veikia toliau.
 */
export async function forwardedClientHeaders(): Promise<Record<string, string>> {
  const secret = webEnv().internalApiSecret;
  if (!secret) return {};
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim();
  return ip ? { 'X-Internal-Secret': secret, 'X-Client-IP': ip } : { 'X-Internal-Secret': secret };
}

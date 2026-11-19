import 'server-only';
import { headers } from 'next/headers';
import { webEnv } from './env';

/**
 * Antraštės kreipiantis į API pirkėjo vardu:
 * - X-Internal-Secret (INTERNAL_API_SECRET): produkcijoje API POST /orders priima tik su ja
 *   (403 FORBIDDEN_CLIENT be jos), nes API Railway pasiekiamas viešai;
 * - X-Client-IP: tikras naršyklės IP, kad API ribotų pagal pirkėją, o ne pagal Vercel IP.
 *
 * Produkcijoje paslaptis privaloma: serveris be jos nepasileidžia (instrumentation.ts), o
 * webEnv() čia meta klaidą, jei kažkaip vis tiek trūktų.
 */
export async function forwardedClientHeaders(): Promise<Record<string, string>> {
  const secret = webEnv().internalApiSecret;
  if (!secret) return {};
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim();
  return ip ? { 'X-Internal-Secret': secret, 'X-Client-IP': ip } : { 'X-Internal-Secret': secret };
}

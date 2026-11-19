import 'server-only';
import { headers } from 'next/headers';

let warned = false;

/**
 * Pirkėjo naršyklės IP API ribojimui. API kviečia web serveris, todėl be šito visi užsakymai
 * atrodytų atėję iš vieno (Vercel) IP. X-Client-IP API priima tik su teisinga
 * INTERNAL_API_SECRET (ta pati reikšmė Railway ir Vercel web projekte).
 *
 * Be paslapties užsakymų neblokuojam (pardavimas svarbiau), bet produkcijoje tai klaida:
 * kai API įjungs užsakymų ribojimą, visi pirkėjai dalinsis vienu limitu.
 */
export async function forwardedClientHeaders(): Promise<Record<string, string>> {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production' && !warned) {
      warned = true;
      console.error(
        '[web] INTERNAL_API_SECRET nenustatytas: API negaus pirkėjų IP. Nustatyk tą pačią ' +
          'reikšmę kaip API (Railway) web projekto aplinkoje (Vercel).',
      );
    }
    return {};
  }
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim();
  return ip ? { 'X-Internal-Secret': secret, 'X-Client-IP': ip } : {};
}

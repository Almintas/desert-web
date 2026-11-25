import { DEFAULT_SHOP_INFO, type ShopInfo, shopInfoInputSchema } from '@desert-web/shared';
import { cache } from 'react';
import { webEnv } from './env';

/** Kiek sekundžių talpinama parduotuvės informacija (admin pakeitimai matomi per ~minutę). */
export const SHOP_INFO_REVALIDATE_SECONDS = 60;
const SHOP_INFO_TIMEOUT_MS = 3_000;

type Fetch = (
  input: string,
  init?: RequestInit & { next?: { revalidate?: number } },
) => Promise<Response>;

/**
 * Parduotuvės informacija iš API (GET /shop-info), talpinama 60 s. Bet kokia klaida (API
 * nepasiekiamas, ne 2xx, netinkamas atsakymas) grąžina numatytąsias reikšmes, kad poraštė ir
 * pagrindinis puslapis niekada nesulūžtų (taip pat ir build metu, kai API ar API_URL nėra).
 */
export async function loadShopInfo(fetchImpl: Fetch = fetch, apiUrl?: string): Promise<ShopInfo> {
  try {
    // Kintamieji tikrinami čia (ne parametro reikšmėje): produkcinio build'o metu API_URL
    // gali nebūti, tada irgi numatytosios reikšmės.
    const res = await fetchImpl(`${apiUrl ?? webEnv().apiUrl}/shop-info`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: SHOP_INFO_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(SHOP_INFO_TIMEOUT_MS),
    });
    if (!res.ok) return DEFAULT_SHOP_INFO;
    const parsed = shopInfoInputSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : DEFAULT_SHOP_INFO;
  } catch {
    return DEFAULT_SHOP_INFO;
  }
}

/** Vienas kreipinys per užklausą (layout, puslapis ir komponentai dalijasi rezultatu). */
export const getShopInfo = cache(() => loadShopInfo());

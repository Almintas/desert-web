import {
  DEFAULT_PICKUP_INFO,
  DEFAULT_SHOP_INFO,
  defaultPickupInfo,
  pickupInfoInputSchema,
  type ShopInfoDto,
  shopInfoInputSchema,
} from '@desert-web/shared';
import { cache } from 'react';
import { webEnv } from './env';

/** Kiek sekundžių talpinama parduotuvės informacija (admin pakeitimai matomi per ~minutę). */
export const SHOP_INFO_REVALIDATE_SECONDS = 60;
const SHOP_INFO_TIMEOUT_MS = 3_000;

/** Kai API nepasiekiamas ar atsakymas netinkamas. */
export const FALLBACK_SHOP_INFO: ShopInfoDto = {
  ...DEFAULT_SHOP_INFO,
  pickup: DEFAULT_PICKUP_INFO,
};

type Fetch = (
  input: string,
  init?: RequestInit & { next?: { revalidate?: number } },
) => Promise<Response>;

/**
 * Parduotuvės informacija ir atsiėmimas iš API (GET /shop-info), talpinama 60 s. Bet kokia
 * klaida (API nepasiekiamas, ne 2xx, netinkamas atsakymas) grąžina numatytąsias reikšmes, kad
 * poraštė ir pagrindinis puslapis niekada nesulūžtų (taip pat ir build metu, kai API ar API_URL
 * nėra). Be `pickup` (senas API): numatytasis atsiėmimas pagal pardavėjo adresą.
 */
export async function loadShopInfo(
  fetchImpl: Fetch = fetch,
  apiUrl?: string,
): Promise<ShopInfoDto> {
  try {
    // Kintamieji tikrinami čia (ne parametro reikšmėje): produkcinio build'o metu API_URL
    // gali nebūti, tada irgi numatytosios reikšmės.
    const res = await fetchImpl(`${apiUrl ?? webEnv().apiUrl}/shop-info`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: SHOP_INFO_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(SHOP_INFO_TIMEOUT_MS),
    });
    if (!res.ok) return FALLBACK_SHOP_INFO;
    const body: unknown = await res.json();
    const shop = shopInfoInputSchema.safeParse(body);
    if (!shop.success) return FALLBACK_SHOP_INFO;
    const pickup = pickupInfoInputSchema.safeParse((body as { pickup?: unknown }).pickup);
    return {
      ...shop.data,
      pickup: pickup.success ? pickup.data : defaultPickupInfo(shop.data.seller),
    };
  } catch {
    return FALLBACK_SHOP_INFO;
  }
}

/** Vienas kreipinys per užklausą (layout, puslapis ir komponentai dalijasi rezultatu). */
export const getShopInfo = cache(() => loadShopInfo());

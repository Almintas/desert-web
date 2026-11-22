import 'server-only';
import type { CurrentSaleWindowResponse, PublicSaleWindowDto } from '@desert-web/shared';
import { apiFetch } from './api';

/** Atidaryti ir artimiausias langas; null, jei API nepasiekiamas. */
export async function loadCurrentWindows(): Promise<CurrentSaleWindowResponse | null> {
  try {
    const current = await apiFetch<CurrentSaleWindowResponse>('/sale-windows/current');
    // Senesnis API grąžina tik `open`.
    return { ...current, openWindows: current.openWindows ?? (current.open ? [current.open] : []) };
  } catch (error) {
    console.error('[web] /sale-windows/current failed', error);
    return null;
  }
}

/** Query parametras, kuriuo pasirenkamas vienas iš kelių atidarytų langų. */
export const WINDOW_PARAM = 'langas';

/** Pasirinktas atidarytas langas: pagal `?langas=<id>`, kitaip pirmas. */
export function pickOpenWindow(
  current: CurrentSaleWindowResponse,
  windowId: string | string[] | undefined,
): PublicSaleWindowDto | null {
  const id = Array.isArray(windowId) ? windowId[0] : windowId;
  return current.openWindows.find((w) => w.id === id) ?? current.openWindows[0] ?? null;
}

/** Puslapio adresas konkrečiam langui (be parametro, jei atidarytas tik vienas). */
export function windowHref(path: string, windowId: string, openCount: number): string {
  return openCount > 1 ? `${path}?${WINDOW_PARAM}=${encodeURIComponent(windowId)}` : path;
}

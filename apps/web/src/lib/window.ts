import 'server-only';
import type { CurrentSaleWindowResponse, PublicSaleWindowDto } from '@desert-web/shared';
import { apiFetch } from './api';

export { WINDOW_PARAM, windowHref } from './links';

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

/** Pasirinktas atidarytas langas: pagal `?langas=<id>`, kitaip pirmas. */
export function pickOpenWindow(
  current: CurrentSaleWindowResponse,
  windowId: string | string[] | undefined,
): PublicSaleWindowDto | null {
  const id = Array.isArray(windowId) ? windowId[0] : windowId;
  return current.openWindows.find((w) => w.id === id) ?? current.openWindows[0] ?? null;
}

import 'server-only';
import type { CurrentSaleWindowResponse } from '@desert-web/shared';
import { apiFetch } from './api';

/** Dabartinis ir artimiausias langas; null, jei API nepasiekiamas. */
export async function loadCurrentWindows(): Promise<CurrentSaleWindowResponse | null> {
  try {
    return await apiFetch<CurrentSaleWindowResponse>('/sale-windows/current');
  } catch (error) {
    console.error('[web] /sale-windows/current failed', error);
    return null;
  }
}

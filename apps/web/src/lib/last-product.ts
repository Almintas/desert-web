'use client';

import { useEffect, useState } from 'react';

/**
 * Paskutinė užsakymo puslapyje atidaryta prekė (`?preke=`), atskirai kiekvienam langui. Pagal ją
 * krepšelio juosta prekių sąraše grąžina į tą patį puslapį (pvz. po „Pridėti kitų desertų“).
 * Laikoma sessionStorage (tik šiam skirtukui); be jo juosta veda į įprastą užsakymą.
 */
const PREFIX = 'dw:lastProduct:';

export function rememberLastProduct(windowId: string, variantId: string): void {
  try {
    sessionStorage.setItem(PREFIX + windowId, variantId);
  } catch {
    // ignoruojam: juosta tiesiog ves į įprastą užsakymą
  }
}

function readLastProduct(windowId: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + windowId) || null;
  } catch {
    return null;
  }
}

/**
 * Paskutinė atidaryta prekė: `undefined`, kol dar neperskaityta (serveris ir pirmas kliento
 * atvaizdavimas, kad nebūtų hidratacijos neatitikimo), tada varianto ID arba null.
 */
export function useLastProduct(windowId: string): string | null | undefined {
  const [lastProduct, setLastProduct] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage pasiekiamas tik po hidratacijos
    setLastProduct(readLastProduct(windowId));
  }, [windowId]);
  return lastProduct;
}

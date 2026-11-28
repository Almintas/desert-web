'use client';

import { useSyncExternalStore } from 'react';

/**
 * Paskutinis aplankytas užsakymo puslapis (kurią prekę pirkėjas žiūrėjo, `?preke=`), atskirai
 * kiekvienam langui. Paspaudus „Pridėti kitų desertų“ ir grįžus į prekių sąrašą, krepšelio
 * juosta pagal tai grąžina į tą patį puslapį. Laikoma sessionStorage (tik šiam skirtukui);
 * be jo (privatus režimas ir pan.) juosta tiesiog veda į įprastą užsakymą.
 */
const PREFIX = 'dw-last-checkout:';

/** Saugoma reikšmė, kai paskutinis puslapis buvo užsakymas be prekės. */
const NO_PRODUCT = '-';

export function rememberCheckout(windowId: string, variantId: string | null): void {
  try {
    sessionStorage.setItem(PREFIX + windowId, variantId ?? NO_PRODUCT);
  } catch {
    // ignoruojam: grįžimas veiks be prekės
  }
}

function read(windowId: string): string | null {
  try {
    const stored = sessionStorage.getItem(PREFIX + windowId);
    return stored && stored !== NO_PRODUCT ? stored : null;
  } catch {
    return null;
  }
}

const noSubscribe = () => () => {};

/** Paskutinė užsakymo puslapyje žiūrėta prekė (varianto ID) arba null. Serveryje visada null. */
export function useLastCheckoutVariant(windowId: string): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => read(windowId),
    () => null,
  );
}

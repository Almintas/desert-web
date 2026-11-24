'use client';

import type { PublicSaleWindowDto } from '@desert-web/shared';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { canGiftWrap } from '@desert-web/shared';
import {
  adjustCart,
  type CartLine,
  type CartTotals,
  cartTotals,
  giftWrapQuantityOf,
  itemLabel,
  maxQuantity,
  sameLine,
  withGiftWrap,
} from './cart-logic';

/**
 * Krepšelis naršyklėje, atskirai kiekvienam langui (`dw-cart:v1:<windowId>`).
 * localStorage gali nebūti (privatus režimas, išjungti slapukai, pilna atmintis): tada
 * krepšelis gyvena atmintyje, kol puslapis atidarytas. Kiekviena prieiga apgaubta try/catch.
 */
const PREFIX = 'dw-cart:v1:';
const EMPTY: CartLine[] = [];

const memory = new Map<string, CartLine[]>();
const listeners = new Set<() => void>();

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null): CartLine[] | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data.flatMap((l: unknown) => {
      const line = l as Partial<CartLine> | null;
      if (
        !line ||
        typeof line.variantId !== 'string' ||
        typeof line.label !== 'string' ||
        !Number.isInteger(line.quantity) ||
        (line.quantity ?? 0) <= 0
      ) {
        return [];
      }
      const parsed: CartLine = {
        variantId: line.variantId,
        label: line.label,
        quantity: line.quantity!,
      };
      // Senas krepšelis be pakavimo arba sugadinta reikšmė: tiesiog be pakavimo.
      const gift = Number.isInteger(line.giftWrapQuantity) ? line.giftWrapQuantity! : 0;
      return [withGiftWrap(parsed, gift)];
    });
  } catch {
    return null;
  }
}

function load(windowId: string): CartLine[] {
  const cached = memory.get(windowId);
  if (cached) return cached;
  let lines: CartLine[] = EMPTY;
  try {
    lines = parse(safeStorage()?.getItem(PREFIX + windowId) ?? null) ?? EMPTY;
  } catch {
    // ignoruojam: liekam su tuščiu krepšeliu atmintyje
  }
  memory.set(windowId, lines);
  return lines;
}

function save(windowId: string, lines: CartLine[]): void {
  memory.set(windowId, lines.length > 0 ? lines : EMPTY);
  try {
    const storage = safeStorage();
    if (lines.length > 0) storage?.setItem(PREFIX + windowId, JSON.stringify(lines));
    else storage?.removeItem(PREFIX + windowId);
  } catch {
    // ignoruojam: atmintyje krepšelis vis tiek atnaujintas
  }
  listeners.forEach((l) => l());
}

/** Išvalo kitų (senų) langų krepšelius, kad localStorage neaugtų. */
function dropOtherWindows(windowId: string): void {
  try {
    const storage = safeStorage();
    if (!storage) return;
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX) && key !== PREFIX + windowId) stale.push(key);
    }
    stale.forEach((k) => storage.removeItem(k));
  } catch {
    // ignoruojam
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Kitas skirtukas pakeitė krepšelį: perskaitom iš naujo.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PREFIX)) {
      memory.clear();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function clearCart(windowId: string): void {
  save(windowId, EMPTY);
}

export interface UseCart {
  /** false serverio ir pirmo kliento atvaizdavimo metu (krepšelis dar neperskaitytas). */
  ready: boolean;
  lines: CartLine[];
  count: number;
  totalCents: number;
  /** Sumos su išskaidymu (prekės ir dovanų pakavimas). */
  totals: CartTotals;
  quantityOf: (variantId: string) => number;
  setQuantity: (variantId: string, quantity: number) => void;
  /** Kiek vienetų supakuoti kaip dovaną (apribojama iki kiekio; tik kur pakavimas galimas). */
  setGiftWrap: (variantId: string, giftWrapQuantity: number) => void;
  replace: (lines: CartLine[]) => void;
  clear: () => void;
  /** Ką pakeitė suderinimas su langu įkeliant (rodoma vieną kartą). */
  loadChanges: string[];
  dismissLoadChanges: () => void;
}

/** Atidaryto lango krepšelis. Įkeliant pašalina dingusias prekes ir sumažina kiekius. */
export function useCart(saleWindow: PublicSaleWindowDto): UseCart {
  const windowId = saleWindow.id;
  const lines = useSyncExternalStore(
    subscribe,
    () => load(windowId),
    () => EMPTY,
  );
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [loadChanges, setLoadChanges] = useState<string[]>([]);

  // Įkeliant (ir kai pasikeičia lango duomenys) suderinam su langu.
  useEffect(() => {
    dropOtherWindows(windowId);
    const current = load(windowId);
    const adjusted = adjustCart(current, saleWindow);
    const changed =
      adjusted.lines.length !== current.length ||
      adjusted.lines.some((l, i) => !sameLine(l, current[i]));
    if (changed) save(windowId, adjusted.lines);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- krepšelis (localStorage) suderinamas su langu tik po hidratacijos
    if (adjusted.changes.length > 0) setLoadChanges(adjusted.changes);
  }, [windowId, saleWindow]);

  const setQuantity = useCallback(
    (variantId: string, quantity: number) => {
      const item = saleWindow.items.find((i) => i.variantId === variantId);
      if (!item) return;
      const q = Math.max(0, Math.min(Math.trunc(quantity), maxQuantity(item)));
      const current = load(windowId);
      const exists = current.some((l) => l.variantId === variantId);
      // Sumažinus kiekį, pakavimas apribojamas iki naujo kiekio (withGiftWrap).
      const next =
        q === 0
          ? current.filter((l) => l.variantId !== variantId)
          : exists
            ? current.map((l) =>
                l.variantId === variantId
                  ? withGiftWrap({ ...l, quantity: q }, giftWrapQuantityOf(l))
                  : l,
              )
            : [...current, { variantId, quantity: q, label: itemLabel(item) }];
      save(windowId, next);
    },
    [saleWindow, windowId],
  );

  const setGiftWrap = useCallback(
    (variantId: string, giftWrapQuantity: number) => {
      const item = saleWindow.items.find((i) => i.variantId === variantId);
      if (!canGiftWrap(saleWindow, item)) return;
      const current = load(windowId);
      if (!current.some((l) => l.variantId === variantId)) return;
      save(
        windowId,
        current.map((l) => (l.variantId === variantId ? withGiftWrap(l, giftWrapQuantity) : l)),
      );
    },
    [saleWindow, windowId],
  );

  const totals = useMemo(() => cartTotals(lines, saleWindow), [lines, saleWindow]);

  return {
    ready,
    lines,
    count: totals.count,
    totalCents: totals.totalCents,
    totals,
    quantityOf: (variantId) => lines.find((l) => l.variantId === variantId)?.quantity ?? 0,
    setQuantity,
    setGiftWrap,
    replace: (next) => save(windowId, next),
    clear: () => save(windowId, EMPTY),
    loadChanges,
    dismissLoadChanges: () => setLoadChanges([]),
  };
}

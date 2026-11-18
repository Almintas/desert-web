import type { SaleWindowPhase } from '@desert-web/shared';

/** Langas, su kuriuo kertasi laikas (WINDOW_OVERLAP). */
export interface OverlapWindow {
  id: string;
  title: string;
  opensAt: string;
  closesAt: string;
}

/** Server Action atsakymas (sėkmės atveju vyksta redirect). */
export interface SaleWindowFormState {
  /** Bendra klaida formos viršuje. */
  error?: string;
  /** Laukų klaidos pagal kelią kaip API `issues` (pvz., "closesAt", "items.0.quantityTotal"). */
  fieldErrors?: Record<string, string>;
  overlap?: OverlapWindow;
}

/** Produktas prekių pasirinkimui formoje. */
export interface ProductOption {
  id: string;
  name: string;
  isActive: boolean;
  variants: { id: string; name: string; priceCents: number }[];
}

export const WINDOW_COMMANDS = [
  'publish',
  'unpublish',
  'open-now',
  'close-now',
  'cancel',
  'delete',
] as const;
export type WindowCommand = (typeof WINDOW_COMMANDS)[number];

export const PHASE_LABELS: Record<SaleWindowPhase, string> = {
  open: 'Vyksta',
  upcoming: 'Paskelbtas',
  draft: 'Juodraštis',
  closed: 'Pasibaigęs',
  cancelled: 'Atšauktas',
};

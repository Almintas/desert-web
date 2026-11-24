import type { SpecialOrderStatus } from '@desert-web/shared';

/** Būsena (vienaskaita: ženkleliai, istorija). */
export const SPECIAL_ORDER_STATUS_LABELS: Record<SpecialOrderStatus, string> = {
  requested: 'Nauja užklausa',
  confirmed: 'Patvirtinta',
  completed: 'Įvykdyta',
  rejected: 'Atmesta',
  cancelled: 'Atšaukta',
};

/** Sąrašo skirtukas: „active“ (requested + confirmed, numatyta), būsena arba „all“. */
export type SpecialOrderTab = 'active' | SpecialOrderStatus | 'all';

export const SPECIAL_ORDER_TABS: { tab: SpecialOrderTab; label: string }[] = [
  { tab: 'active', label: 'Aktyvios' },
  { tab: 'requested', label: 'Naujos' },
  { tab: 'confirmed', label: 'Patvirtintos' },
  { tab: 'completed', label: 'Įvykdytos' },
  { tab: 'rejected', label: 'Atmestos' },
  { tab: 'cancelled', label: 'Atšauktos' },
  { tab: 'all', label: 'Visos' },
];

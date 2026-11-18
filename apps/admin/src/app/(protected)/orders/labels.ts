import type { FulfillmentMethod, OrderStatus } from '@desert-web/shared';

/** Būsena (vienaskaita: ženkleliai, istorija). */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Laukia',
  confirmed: 'Patvirtintas',
  ready: 'Paruoštas',
  completed: 'Įvykdytas',
  cancelled: 'Atšauktas',
};

/** Sąrašo skirtukai (daugiskaita). */
export const ORDER_STATUS_TABS: { status: OrderStatus | 'all'; label: string }[] = [
  { status: 'all', label: 'Visi' },
  { status: 'pending', label: 'Laukia' },
  { status: 'confirmed', label: 'Patvirtinti' },
  { status: 'ready', label: 'Paruošti' },
  { status: 'completed', label: 'Įvykdyti' },
  { status: 'cancelled', label: 'Atšaukti' },
];

/** Mygtukai perėjimams pirmyn. */
export const ORDER_STATUS_ACTIONS: Record<OrderStatus, string> = {
  pending: '',
  confirmed: 'Patvirtinti',
  ready: 'Pažymėti paruoštu',
  completed: 'Pažymėti įvykdytu',
  cancelled: '',
};

export const FULFILLMENT_LABELS: Record<FulfillmentMethod, string> = {
  pickup: 'Atsiėmimas',
  delivery: 'Pristatymas',
};

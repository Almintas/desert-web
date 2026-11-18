import type { OrderStatus } from './enums';

/** Užsakymo eiga. Galima eiti tik pirmyn (ir peršokti būsenas), atgal negalima. */
export const ORDER_STATUS_FLOW = ['pending', 'confirmed', 'ready', 'completed'] as const;

/** completed ir cancelled yra galutinės: iš jų niekur nebeinama. */
export function isFinalOrderStatus(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/** Į kokias eigos būsenas galima pereiti iš `status` (be atšaukimo). */
export function nextOrderStatuses(status: OrderStatus): OrderStatus[] {
  if (isFinalOrderStatus(status)) return [];
  const index = ORDER_STATUS_FLOW.indexOf(status as (typeof ORDER_STATUS_FLOW)[number]);
  return ORDER_STATUS_FLOW.slice(index + 1);
}

/** Iš kokių būsenų galima pereiti į `to` (atšaukti galima iš bet kurios negalutinės). */
export function orderStatusesAllowingTransitionTo(to: OrderStatus): OrderStatus[] {
  if (to === 'cancelled') return ['pending', 'confirmed', 'ready'];
  const index = ORDER_STATUS_FLOW.indexOf(to as (typeof ORDER_STATUS_FLOW)[number]);
  return index > 0 ? ORDER_STATUS_FLOW.slice(0, index) : [];
}

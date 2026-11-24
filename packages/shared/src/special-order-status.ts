import type { SpecialOrderStatus } from './enums';

/**
 * Specialaus užsakymo būsenų perėjimai:
 * requested -> confirmed -> completed; requested -> rejected; requested | confirmed -> cancelled.
 * completed, rejected ir cancelled yra galutinės.
 */
export const SPECIAL_ORDER_TRANSITIONS: Readonly<
  Record<SpecialOrderStatus, readonly SpecialOrderStatus[]>
> = {
  requested: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

/** Aktyvios (dar laukiančios veiksmų) būsenos: numatytasis admin sąrašo filtras. */
export const ACTIVE_SPECIAL_ORDER_STATUSES = [
  'requested',
  'confirmed',
] as const satisfies readonly SpecialOrderStatus[];

export function isFinalSpecialOrderStatus(status: SpecialOrderStatus): boolean {
  return SPECIAL_ORDER_TRANSITIONS[status].length === 0;
}

export function canTransitionSpecialOrder(
  from: SpecialOrderStatus,
  to: SpecialOrderStatus,
): boolean {
  return SPECIAL_ORDER_TRANSITIONS[from].includes(to);
}

/** Iš kokių būsenų galima pereiti į `to` (sąlyga sąlyginiam DB atnaujinimui). */
export function specialOrderStatusesAllowingTransitionTo(
  to: SpecialOrderStatus,
): SpecialOrderStatus[] {
  return (Object.keys(SPECIAL_ORDER_TRANSITIONS) as SpecialOrderStatus[]).filter((from) =>
    canTransitionSpecialOrder(from, to),
  );
}

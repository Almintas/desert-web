import type { SpecialOrderStatus } from '@desert-web/shared';
import { SPECIAL_ORDER_STATUS_LABELS } from './labels';

export function SpecialOrderStatusBadge({ status }: { status: SpecialOrderStatus }) {
  return <span className={`badge special-${status}`}>{SPECIAL_ORDER_STATUS_LABELS[status]}</span>;
}

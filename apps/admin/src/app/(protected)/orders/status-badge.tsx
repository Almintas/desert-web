import type { OrderStatus } from '@desert-web/shared';
import { ORDER_STATUS_LABELS } from './labels';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge order-${status}`}>{ORDER_STATUS_LABELS[status]}</span>;
}

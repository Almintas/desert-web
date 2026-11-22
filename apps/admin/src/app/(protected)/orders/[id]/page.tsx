import { formatEur, formatShopDateTime } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchOrder } from '../data';
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../labels';
import { OrderActions } from '../order-actions';
import { OrderStatusBadge } from '../status-badge';

export const metadata: Metadata = { title: 'Užsakymas' };

const DONE_MESSAGES: Record<string, string> = {
  confirmed: 'Užsakymas patvirtintas.',
  ready: 'Užsakymas pažymėtas paruoštu.',
  completed: 'Užsakymas pažymėtas įvykdytu.',
  cancel: 'Užsakymas atšauktas, kiekiai grąžinti į langą.',
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ id }, { done }] = await Promise.all([params, searchParams]);
  const order = await fetchOrder(id);
  const doneMessage = done ? DONE_MESSAGES[done] : undefined;
  const { customer, fulfillment } = order;

  return (
    <>
      <p className="breadcrumbs">
        <Link href={`/orders?window=${order.saleWindow.id}`}>← Užsakymai</Link>
      </p>
      <div className="page-header">
        <h1>Užsakymas {order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      {doneMessage ? (
        <p className="alert success" role="status">
          {doneMessage}
        </p>
      ) : null}
      {order.cancellation ? (
        <div className="alert info">
          <p>
            Atšauktas {formatShopDateTime(order.cancellation.cancelledAt)}
            {order.cancellation.reason ? `: ${order.cancellation.reason}` : '.'}
          </p>
        </div>
      ) : null}

      {/* key: po veiksmo patvirtinimo būsena išvaloma. */}
      <OrderActions key={order.updatedAt} order={order} />

      <dl className="summary">
        <div className="wide">
          <dt>Pirkėjas</dt>
          <dd>
            {customer.name}
            <a href={`tel:${customer.phone.replace(/[^\d+]/g, '')}`} className="muted nowrap">
              {customer.phone}
            </a>
            <a href={`mailto:${customer.email}`} className="muted">
              {customer.email}
            </a>
          </dd>
        </div>
        <div>
          <dt>Pateiktas</dt>
          <dd>{formatShopDateTime(order.createdAt)}</dd>
        </div>
        <div>
          <dt>Pardavimo langas</dt>
          <dd>
            <Link href={`/sale-windows/${order.saleWindow.id}`}>{order.saleWindow.title}</Link>
          </dd>
        </div>
        <div>
          <dt>{FULFILLMENT_LABELS[fulfillment.method]}</dt>
          <dd>
            {fulfillment.method === 'delivery' ? (fulfillment.address ?? '—') : 'Pirkėjas atsiims'}
          </dd>
        </div>
        <div>
          <dt>Apmokėjimas</dt>
          <dd>
            {order.payment ? (
              <>
                <span className={order.payment.status === 'paid' ? 'strong' : undefined}>
                  {PAYMENT_STATUS_LABELS[order.payment.status]}
                </span>
                <span className="muted small">
                  {order.payment.method
                    ? `Mokama ${PAYMENT_METHOD_LABELS[order.payment.method] ?? order.payment.method}`
                    : null}
                  {order.payment.paidAt
                    ? ` · ${formatShopDateTime(order.payment.paidAt)}`
                    : order.payment.status === 'unpaid' && order.status !== 'cancelled'
                      ? ' · bus apmokėtas pažymėjus įvykdytu'
                      : null}
                </span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      {fulfillment.notes ? (
        <div className="note">
          <p className="muted small">Pirkėjo pastabos</p>
          <p>{fulfillment.notes}</p>
        </div>
      ) : null}

      <h2>Prekės</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Prekė</th>
              <th scope="col">Kaina</th>
              <th scope="col">Kiekis</th>
              <th scope="col">Suma</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.variantId}>
                <td>
                  <span className="strong">{i.productName}</span>
                  <span className="muted small">{i.variantName}</span>
                  {i.giftWrapQuantity > 0 ? (
                    <span className="gift-line">
                      Supakuoti kaip dovaną:{' '}
                      <span className="nowrap">
                        {i.giftWrapQuantity} vnt. × {formatEur(i.giftWrapUnitPriceCents)}
                      </span>
                    </span>
                  ) : null}
                </td>
                <td className="nowrap">{formatEur(i.unitPriceCents)}</td>
                <td>{i.quantity}</td>
                <td className="nowrap">{formatEur(i.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {order.giftWrapTotalCents > 0 ? (
              <>
                <tr className="subtotal">
                  <th scope="row" colSpan={3}>
                    Prekės
                  </th>
                  <td className="nowrap">{formatEur(order.itemsTotalCents)}</td>
                </tr>
                <tr className="subtotal">
                  <th scope="row" colSpan={3}>
                    Dovanų pakavimas ({order.items.reduce((sum, i) => sum + i.giftWrapQuantity, 0)}{' '}
                    vnt.)
                  </th>
                  <td className="nowrap">{formatEur(order.giftWrapTotalCents)}</td>
                </tr>
              </>
            ) : null}
            <tr>
              <th scope="row" colSpan={3}>
                Iš viso
              </th>
              <td className="nowrap strong">{formatEur(order.totalCents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h2>Būsenų istorija</h2>
      <ol className="history">
        {order.statusHistory.map((h, i) => (
          <li key={`${h.status}-${i}`}>
            <OrderStatusBadge status={h.status} />
            <span>{formatShopDateTime(h.at)}</span>
            <span className="muted small">
              {h.adminId ? `pakeitė ${h.adminEmail ?? 'ištrintas adminas'}` : 'pateikė pirkėjas'}
            </span>
          </li>
        ))}
      </ol>
      <p className="hint">
        Dabartinė būsena: {ORDER_STATUS_LABELS[order.status]}. Laikai rodomi Lietuvos laiku.
      </p>
    </>
  );
}

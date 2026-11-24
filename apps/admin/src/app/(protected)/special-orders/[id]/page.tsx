import {
  formatCalendarDate,
  formatEur,
  formatPickupRange,
  formatShopDateTime,
  telHref,
} from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '../../orders/labels';
import { fetchSpecialOrder } from '../data';
import { SPECIAL_ORDER_STATUS_LABELS } from '../labels';
import { SpecialOrderActions } from '../special-order-actions';
import { SpecialOrderStatusBadge } from '../status-badge';

export const metadata: Metadata = { title: 'Specialus užsakymas' };

const DONE_MESSAGES: Record<string, string> = {
  confirm: 'Užklausa patvirtinta.',
  reject: 'Užklausa atmesta.',
  cancel: 'Užklausa atšaukta.',
  complete: 'Užklausa pažymėta įvykdyta ir apmokėta.',
};

export default async function SpecialOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ id }, { done }] = await Promise.all([params, searchParams]);
  const so = await fetchSpecialOrder(id);
  const doneMessage = done ? DONE_MESSAGES[done] : undefined;
  const { customer, confirmation } = so;

  return (
    <>
      <p className="breadcrumbs">
        <Link href="/special-orders">← Specialūs užsakymai</Link>
      </p>
      <div className="page-header">
        <h1>Užklausa {so.requestNumber}</h1>
        <SpecialOrderStatusBadge status={so.status} />
      </div>

      {doneMessage ? (
        <p className="alert success" role="status">
          {doneMessage}
        </p>
      ) : null}
      {so.rejectionReason ? (
        <div className="alert info">
          <p>Atmesta: {so.rejectionReason}</p>
        </div>
      ) : null}
      {so.cancellation ? (
        <div className="alert info">
          <p>
            Atšaukta {formatShopDateTime(so.cancellation.cancelledAt)}
            {so.cancellation.reason ? `: ${so.cancellation.reason}` : '.'}
          </p>
        </div>
      ) : null}

      {/* key: po veiksmo būsena išvaloma. */}
      <SpecialOrderActions key={so.updatedAt} specialOrder={so} />

      <dl className="summary">
        <div className="wide">
          <dt>Pirkėjas</dt>
          <dd>
            {customer.name}
            <a href={telHref(customer.phone)} className="muted nowrap">
              {customer.phone}
            </a>
            <a href={`mailto:${customer.email}`} className="muted">
              {customer.email}
            </a>
          </dd>
        </div>
        <div>
          <dt>Pageidaujama data</dt>
          <dd>{formatCalendarDate(so.desiredDate)}</dd>
        </div>
        <div>
          <dt>Pateikta</dt>
          <dd>{formatShopDateTime(so.createdAt)}</dd>
        </div>
        <div className="wide">
          <dt>Atsiėmimas</dt>
          <dd>
            {confirmation ? (
              <>
                {formatPickupRange(confirmation.pickupFrom, confirmation.pickupTo)}
                <span className="muted">{confirmation.pickupLocation}</span>
              </>
            ) : (
              <span className="muted">Bus nurodytas tvirtinant</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Apmokėjimas</dt>
          <dd>
            {so.payment ? (
              <>
                <span className={so.payment.status === 'paid' ? 'strong' : undefined}>
                  {PAYMENT_STATUS_LABELS[so.payment.status]}
                </span>
                <span className="muted small">
                  {so.payment.method
                    ? `Mokama ${PAYMENT_METHOD_LABELS[so.payment.method] ?? so.payment.method}`
                    : null}
                  {so.payment.paidAt ? ` · ${formatShopDateTime(so.payment.paidAt)}` : null}
                </span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      {so.customerNotes ? (
        <div className="note">
          <p className="muted small">Pirkėjo pastabos</p>
          <p className="pre-line">{so.customerNotes}</p>
        </div>
      ) : null}
      {confirmation?.adminMessage ? (
        <div className="note">
          <p className="muted small">Žinutė pirkėjui</p>
          <p className="pre-line">{confirmation.adminMessage}</p>
        </div>
      ) : null}

      <h2>Prekės</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Prekė</th>
              <th scope="col">Bazinė kaina</th>
              <th scope="col">Kiekis</th>
              <th scope="col">Suma</th>
            </tr>
          </thead>
          <tbody>
            {so.items.map((i) => (
              <tr key={i.variantId}>
                <td>
                  <span className="strong">{i.productName}</span>
                  <span className="muted small">{i.variantName}</span>
                </td>
                <td className="nowrap">{formatEur(i.estimatedUnitPriceCents)}</td>
                <td>{i.quantity}</td>
                <td className="nowrap">{formatEur(i.estimatedLineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={confirmation ? 'subtotal' : undefined}>
              <th scope="row" colSpan={3}>
                Apskaičiuota suma
              </th>
              <td className={confirmation ? 'nowrap' : 'nowrap strong'}>
                {formatEur(so.estimatedTotalCents)}
              </td>
            </tr>
            {confirmation ? (
              <tr>
                <th scope="row" colSpan={3}>
                  Galutinė suma
                </th>
                <td className="nowrap strong">{formatEur(confirmation.totalCents)}</td>
              </tr>
            ) : null}
          </tfoot>
        </table>
      </div>

      <h2>Būsenų istorija</h2>
      <ol className="history">
        {so.statusHistory.map((h, i) => (
          <li key={`${h.status}-${i}`}>
            <SpecialOrderStatusBadge status={h.status} />
            <span>{formatShopDateTime(h.at)}</span>
            <span className="muted small">
              {h.adminId ? `pakeitė ${h.adminEmail ?? 'ištrintas adminas'}` : 'pateikė pirkėjas'}
            </span>
          </li>
        ))}
      </ol>
      <p className="hint">
        Dabartinė būsena: {SPECIAL_ORDER_STATUS_LABELS[so.status]}. Laikai rodomi Lietuvos laiku.
      </p>
    </>
  );
}

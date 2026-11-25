'use client';

import {
  type AdminOrderListItemDto,
  type BulkOrderStatus,
  formatEur,
  formatShopDateTime,
  isFinalOrderStatus,
} from '@desert-web/shared';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { bulkStatusAction } from './actions';
import type { BulkActionState } from './form-state';
import { FULFILLMENT_LABELS, ORDER_STATUS_LABELS } from './labels';
import { OrderStatusBadge } from './status-badge';

const BULK_ACTIONS: Record<BulkOrderStatus, { label: string; done: string; confirm: string }> = {
  confirmed: {
    label: 'Patvirtinti',
    done: 'Patvirtinta',
    confirm: 'bus patvirtinti. Pirkėjai gaus laišką.',
  },
  ready: {
    label: 'Paruošta',
    done: 'Paruošta',
    confirm: 'bus pažymėti paruoštais atsiėmimui. Pirkėjai gaus laišką.',
  },
};

/** „1 užsakymas“, „2 užsakymai“, „10 užsakymų“, „21 užsakymas“. */
function ordersWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'užsakymas';
  if (mod10 === 0 || (mod100 >= 11 && mod100 <= 19)) return 'užsakymų';
  return 'užsakymai';
}

function BulkSummary({ result }: { result: NonNullable<BulkActionState['result']> }) {
  const { done } = BULK_ACTIONS[result.status];
  const parts = [`${done} ${result.updated}`];
  if (result.unchanged > 0) parts.push(`jau buvo ${result.unchanged}`);
  if (result.failed.length > 0) parts.push(`praleista ${result.failed.length}`);
  return (
    <div className={`alert ${result.failed.length > 0 ? 'info' : 'success'}`} role="status">
      <p>
        {parts.join(', ')}
        {result.failed.length > 0 ? ':' : '.'}
      </p>
      {result.failed.length > 0 ? (
        <ul>
          {result.failed.map((f, i) => (
            <li key={i}>
              <strong>{f.orderNumber ?? 'Nerastas'}</strong>
              {f.status ? ` (${ORDER_STATUS_LABELS[f.status]})` : ''}: {f.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OrdersTable({
  items,
  showWindow,
  emptyText,
}: {
  items: AdminOrderListItemDto[];
  showWindow: boolean;
  emptyText: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<BulkOrderStatus | null>(null);
  const [state, dispatch, pending] = useActionState<BulkActionState, FormData>(
    async (prev, formData) => {
      const next = await bulkStatusAction(prev, formData);
      if (next.result) {
        setSelected(new Set());
        setConfirming(null);
      }
      return next;
    },
    {},
  );

  const selectable = items.filter((o) => !isFinalOrderStatus(o.status));
  // Po perpiešimo pasirinkimas gali rodyti į nebe matomus ar galutinius užsakymus.
  const chosen = selectable.filter((o) => selected.has(o.id));
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(selectable.map((o) => o.id)));

  return (
    <>
      {state.result ? <BulkSummary result={state.result} /> : null}
      {state.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}

      {items.length === 0 ? <p className="muted">{emptyText}</p> : null}
      <div className="table-wrap" hidden={items.length === 0}>
        <table className="table orders-table">
          <thead>
            <tr>
              <th scope="col" className="select-col">
                <input
                  type="checkbox"
                  aria-label="Pasirinkti visus šiame puslapyje"
                  checked={allChosen}
                  ref={(el) => {
                    if (el) el.indeterminate = chosen.length > 0 && !allChosen;
                  }}
                  onChange={toggleAll}
                  disabled={selectable.length === 0 || pending}
                />
              </th>
              <th scope="col">Nr.</th>
              <th scope="col">Būsena</th>
              <th scope="col">Pirkėjas</th>
              <th scope="col">Suma</th>
              <th scope="col">Vnt.</th>
              <th scope="col">Būdas</th>
              {showWindow ? <th scope="col">Langas</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((o) => {
              const final = isFinalOrderStatus(o.status);
              const checked = !final && selected.has(o.id);
              return (
                <tr key={o.id} className={checked ? 'selected' : undefined}>
                  <td className="select-col">
                    <input
                      type="checkbox"
                      aria-label={`Pasirinkti ${o.orderNumber}`}
                      checked={checked}
                      onChange={() => toggle(o.id)}
                      disabled={final || pending}
                    />
                  </td>
                  <td className="nowrap">
                    <Link href={`/orders/${o.id}`} className="strong">
                      {o.orderNumber}
                    </Link>
                    <span className="muted small">{formatShopDateTime(o.createdAt)}</span>
                  </td>
                  <td>
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td>
                    {o.customer.name}
                    <span className="muted small nowrap">{o.customer.phone}</span>
                  </td>
                  <td className="nowrap">{formatEur(o.totalCents)}</td>
                  <td className="nowrap">
                    {o.itemCount}
                    {o.giftWrapQuantity > 0 ? (
                      <span
                        className="badge gift"
                        title={`Supakuoti kaip dovaną: ${o.giftWrapQuantity} vnt.`}
                      >
                        Dovana
                      </span>
                    ) : null}
                  </td>
                  <td>{FULFILLMENT_LABELS[o.fulfillmentMethod]}</td>
                  {showWindow ? (
                    <td>
                      <Link href={`/sale-windows/${o.saleWindow.id}`}>{o.saleWindow.title}</Link>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {chosen.length > 0 ? (
        <form action={dispatch} className="bulk-bar" aria-label="Veiksmai su pasirinktais">
          {chosen.map((o) => (
            <input key={o.id} type="hidden" name="ids" value={o.id} />
          ))}
          {confirming ? (
            <>
              <input type="hidden" name="status" value={confirming} />
              <p>
                <strong>
                  {chosen.length} {ordersWord(chosen.length)}
                </strong>{' '}
                {BULK_ACTIONS[confirming].confirm}
              </p>
              <div className="panel-actions">
                <button type="submit" className="button" disabled={pending}>
                  {pending ? 'Vykdoma…' : `Taip, ${BULK_ACTIONS[confirming].label.toLowerCase()}`}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setConfirming(null)}
                  disabled={pending}
                >
                  Ne
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Pasirinkta: <strong>{chosen.length}</strong>
              </p>
              <div className="panel-actions">
                {(Object.keys(BULK_ACTIONS) as BulkOrderStatus[]).map((s) => (
                  <button key={s} type="button" className="button" onClick={() => setConfirming(s)}>
                    {BULK_ACTIONS[s].label}
                  </button>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setSelected(new Set())}
                >
                  Atžymėti
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}
    </>
  );
}

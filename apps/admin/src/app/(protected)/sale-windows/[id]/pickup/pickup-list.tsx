'use client';

import { type AdminPickupOrderDto, formatEur, telHref } from '@desert-web/shared';
import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { PAYMENT_STATUS_LABELS } from '../../../orders/labels';
import { OrderStatusBadge } from '../../../orders/status-badge';
import { completePickupAction, type PickupActionState } from './actions';

/** Paieškai: mažosios raidės be diakritikų („sarune“ randa „Šarūnė“). */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Telefono skaitmenys tarptautiniu formatu: „8 612…“ ir „+370 612…“ sutampa. */
function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('8') ? `370${digits.slice(1)}` : digits;
}

function matches(order: AdminPickupOrderDto, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  if (fold(order.customer.name).includes(q) || fold(order.orderNumber).includes(q)) return true;
  const digits = query.replace(/\D/g, '');
  if (digits.length >= 3) {
    const phone = order.customer.phone.replace(/\D/g, '');
    return phone.includes(digits) || phoneDigits(order.customer.phone).includes(phoneDigits(query));
  }
  return false;
}

function ItemList({ order }: { order: AdminPickupOrderDto }) {
  return (
    <ul className="pickup-items">
      {order.items.map((i, index) => (
        <li key={index}>
          <strong>{i.quantity} ×</strong> {i.productName}{' '}
          <span className="muted">({i.variantName})</span>
          {i.giftWrapQuantity > 0 ? (
            <span className="badge gift">Dovana: {i.giftWrapQuantity}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CompleteButton({ order, windowId }: { order: AdminPickupOrderDto; windowId: string }) {
  const action = completePickupAction.bind(null, order.id, windowId);
  const [state, dispatch, pending] = useActionState<PickupActionState, FormData>(action, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="pickup-action">
      {confirming ? (
        <form action={dispatch} className="pickup-confirm">
          <p>
            <strong>Patvirtinti?</strong> {order.customer.name} atsiėmė ir sumokėjo{' '}
            {formatEur(order.totalCents)}. Grąžinti nebus galima.
          </p>
          <div className="panel-actions">
            <button type="submit" className="button big" disabled={pending}>
              {pending ? 'Vykdoma…' : 'Taip, atsiėmė'}
            </button>
            <button
              type="button"
              className="button secondary big"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Ne
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="button big wide" onClick={() => setConfirming(true)}>
          Atsiėmė ir sumokėjo
        </button>
      )}
      {state.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

export function PickupList({
  orders,
  windowId,
}: {
  orders: AdminPickupOrderDto[];
  windowId: string;
}) {
  const [query, setQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const completed = orders.filter((o) => o.status === 'completed');
  const collectedCents = orders
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + o.totalCents, 0);
  const expectedCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const percent = orders.length > 0 ? Math.round((completed.length / orders.length) * 100) : 0;

  const visible = useMemo(
    () => orders.filter((o) => (showCompleted || o.status !== 'completed') && matches(o, query)),
    [orders, showCompleted, query],
  );
  const hiddenByToggle = query.trim()
    ? orders.filter((o) => o.status === 'completed' && matches(o, query)).length
    : completed.length;

  return (
    <div className="pickup">
      <section className="pickup-progress screen-only" aria-label="Eiga">
        <p className="pickup-count">
          Atsiėmė <strong>{completed.length}</strong> iš <strong>{orders.length}</strong>
        </p>
        <div
          className="stock-bar big"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={orders.length}
          aria-valuenow={completed.length}
          aria-label="Atsiimti užsakymai"
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className="muted">
          Surinkta {formatEur(collectedCents)} iš {formatEur(expectedCents)}
        </p>
      </section>

      <div className="pickup-tools screen-only">
        <label className="pickup-search">
          <span className="visually-hidden">Paieška</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Vardas, telefonas ar užsakymo Nr."
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <div className="pickup-toggles">
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Rodyti atsiimtus ({completed.length})
          </label>
          <button type="button" className="button secondary" onClick={() => window.print()}>
            Spausdinti
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <p className="muted screen-only">Šiame lange užsakymų nėra.</p>
      ) : visible.length === 0 ? (
        <p className="muted screen-only">
          {!query.trim()
            ? 'Visi užsakymai atsiimti.'
            : !showCompleted && hiddenByToggle > 0
              ? 'Rasti tik jau atsiimti užsakymai.'
              : 'Pagal paiešką nerasta.'}
          {!showCompleted && hiddenByToggle > 0 ? (
            <>
              {' '}
              <button type="button" className="link-button" onClick={() => setShowCompleted(true)}>
                Rodyti atsiimtus ({hiddenByToggle})
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <ul className="pickup-orders screen-only">
          {visible.map((o) => (
            <li key={o.id} className={`pickup-card status-${o.status}`}>
              <div className="pickup-head">
                <span className="pickup-name">{o.customer.name}</span>
                <OrderStatusBadge status={o.status} />
                <span className={`badge payment-${o.paymentStatus}`}>
                  {PAYMENT_STATUS_LABELS[o.paymentStatus]}
                </span>
              </div>
              <p className="pickup-meta">
                <a href={telHref(o.customer.phone)} className="pickup-phone">
                  {o.customer.phone}
                </a>
                <Link href={`/orders/${o.id}`} className="muted">
                  {o.orderNumber}
                </Link>
              </p>
              <ItemList order={o} />
              {o.notes ? <p className="pickup-notes">Pastabos: {o.notes}</p> : null}
              <div className="pickup-foot">
                <span className="pickup-total">{formatEur(o.totalCents)}</span>
                {o.status === 'completed' ? <span className="done-mark">Atsiėmė ✓</span> : null}
              </div>
              {o.status === 'completed' ? null : (
                // key: pasikeitus būsenai patvirtinimo būsena išvaloma.
                <CompleteButton key={o.status} order={o} windowId={windowId} />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Spausdinimui: visi neatšaukti užsakymai (atsiimti pažymėti ✓). */}
      <table className="pickup-print print-only">
        <thead>
          <tr>
            <th scope="col" className="check-col">
              <span className="visually-hidden">Atsiėmė</span>
            </th>
            <th scope="col">Vardas</th>
            <th scope="col">Telefonas</th>
            <th scope="col">Prekės</th>
            <th scope="col" className="num">
              Suma
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="check-col">
                <span className="print-box">{o.status === 'completed' ? '✓' : ''}</span>
              </td>
              <td>
                {o.customer.name}
                <span className="print-nr">{o.orderNumber}</span>
              </td>
              <td className="nowrap">{o.customer.phone}</td>
              <td>
                {o.items.map((i, index) => (
                  <span key={index} className="print-item">
                    {i.quantity} × {i.productName} ({i.variantName})
                    {i.giftWrapQuantity > 0 ? `, dovana: ${i.giftWrapQuantity}` : ''}
                  </span>
                ))}
                {o.notes ? <span className="print-item">Pastabos: {o.notes}</span> : null}
              </td>
              <td className="num nowrap">{formatEur(o.totalCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Iš viso: {orders.length} užs.</td>
            <td className="num nowrap">{formatEur(expectedCents)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

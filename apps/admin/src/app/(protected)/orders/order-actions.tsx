'use client';

import { type AdminOrderDto, nextOrderStatuses, type OrderStatus } from '@desert-web/shared';
import { useActionState, useState } from 'react';
import { orderAction } from './actions';
import type { OrderActionState } from './form-state';
import { ORDER_STATUS_ACTIONS, ORDER_STATUS_LABELS } from './labels';

type Command = OrderStatus | 'cancel';

export function OrderActions({ order }: { order: AdminOrderDto }) {
  const action = orderAction.bind(null, order.id);
  const [state, dispatch, pending] = useActionState<OrderActionState, FormData>(action, {});
  const [selected, setSelected] = useState<Command | null>(null);
  const next = nextOrderStatuses(order.status);
  if (next.length === 0) return null; // įvykdytas arba atšauktas

  const toggle = (c: Command) => setSelected(selected === c ? null : c);

  return (
    <section className="panel" aria-label="Veiksmai">
      <div className="panel-actions">
        {next.map((s) => (
          <button
            key={s}
            type="button"
            className="button secondary"
            aria-pressed={selected === s}
            onClick={() => toggle(s)}
            disabled={pending}
          >
            {ORDER_STATUS_ACTIONS[s]}
          </button>
        ))}
        <button
          type="button"
          className="button secondary danger"
          aria-pressed={selected === 'cancel'}
          onClick={() => toggle('cancel')}
          disabled={pending}
        >
          Atšaukti užsakymą
        </button>
      </div>

      {selected === 'cancel' ? (
        <form action={dispatch} className="confirm danger form">
          <input type="hidden" name="command" value="cancel" />
          <p>
            <strong>Atšaukti užsakymą {order.orderNumber}?</strong> Užsakyti kiekiai bus grąžinti į
            pardavimo langą „{order.saleWindow.title}“. To atšaukti negalima.
          </p>
          <label>
            Priežastis (neprivaloma)
            <textarea name="reason" rows={2} maxLength={500} />
          </label>
          <div className="panel-actions">
            <button type="submit" className="button danger-solid" disabled={pending}>
              {pending ? 'Vykdoma…' : 'Taip, atšaukti užsakymą'}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setSelected(null)}
              disabled={pending}
            >
              Ne
            </button>
          </div>
        </form>
      ) : selected ? (
        <form action={dispatch} className="confirm">
          <input type="hidden" name="command" value={selected} />
          <p>
            <strong>Pakeisti būseną?</strong> „{ORDER_STATUS_LABELS[order.status]}“ → „
            {ORDER_STATUS_LABELS[selected]}“. Grąžinti ankstesnės būsenos nebus galima.
          </p>
          <div className="panel-actions">
            <button type="submit" className="button" disabled={pending}>
              {pending ? 'Vykdoma…' : `Taip, ${ORDER_STATUS_ACTIONS[selected].toLowerCase()}`}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setSelected(null)}
              disabled={pending}
            >
              Ne
            </button>
          </div>
        </form>
      ) : null}

      {state.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}

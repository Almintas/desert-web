'use client';

import { type AdminSaleWindowDto, formatShopDateTime } from '@desert-web/shared';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { saleWindowCommandAction } from './actions';
import type { SaleWindowFormState, WindowCommand } from './form-state';

interface CommandInfo {
  label: string;
  /** Ką veiksmas padarys (rodoma patvirtinime). */
  confirm: string;
  confirmLabel: string;
  danger?: boolean;
}

const COMMANDS: Record<WindowCommand, CommandInfo> = {
  publish: {
    label: 'Paskelbti',
    confirm: 'Langas bus paskelbtas: pirkėjai jį matys, o užsakymai bus priimami nurodytu laiku.',
    confirmLabel: 'Taip, paskelbti',
  },
  'open-now': {
    label: 'Atidaryti dabar',
    confirm: 'Langas bus paskelbtas ir atidarytas iškart: užsakymai bus priimami nuo dabar.',
    confirmLabel: 'Taip, atidaryti dabar',
  },
  'close-now': {
    label: 'Uždaryti dabar',
    confirm: 'Užsakymai bus nebepriimami nuo šios akimirkos. Jau pateikti užsakymai lieka.',
    confirmLabel: 'Taip, uždaryti',
    danger: true,
  },
  unpublish: {
    label: 'Grąžinti į juodraštį',
    confirm: 'Langas bus paslėptas nuo pirkėjų ir taps juodraščiu.',
    confirmLabel: 'Taip, grąžinti į juodraštį',
  },
  cancel: {
    label: 'Atšaukti langą',
    confirm: 'Langas bus atšauktas visam laikui ir taps tik skaitomas. To atšaukti negalima.',
    confirmLabel: 'Taip, atšaukti langą',
    danger: true,
  },
  delete: {
    label: 'Ištrinti',
    confirm: 'Juodraštis bus ištrintas visam laikui.',
    confirmLabel: 'Taip, ištrinti',
    danger: true,
  },
};

/**
 * Kokie veiksmai rodomi pagal fazę. „Grąžinti į juodraštį“ ir „Atšaukti“ rodomi ir tada,
 * kai lange yra užsakymų: API juos atmeta (WINDOW_HAS_ORDERS), o klaida parodoma čia pat
 * su nuoroda į lango užsakymus.
 */
function availableCommands(w: AdminSaleWindowDto): WindowCommand[] {
  switch (w.phase) {
    case 'draft':
      return [
        'publish',
        'open-now',
        'cancel',
        ...(w.ordersCount === 0 ? (['delete'] as const) : []),
      ];
    case 'upcoming':
      return ['open-now', 'unpublish', 'cancel'];
    case 'open':
      return ['close-now', 'unpublish', 'cancel'];
    case 'closed':
      return ['unpublish', 'cancel'];
    case 'cancelled':
      return [];
  }
}

export function WindowActions({ saleWindow }: { saleWindow: AdminSaleWindowDto }) {
  const action = saleWindowCommandAction.bind(null, saleWindow.id);
  const [state, dispatch, pending] = useActionState<SaleWindowFormState, FormData>(action, {});
  const [selected, setSelected] = useState<WindowCommand | null>(null);
  const commands = availableCommands(saleWindow);
  if (saleWindow.phase === 'cancelled') return null;

  const info = selected ? COMMANDS[selected] : null;

  return (
    <section className="panel" aria-label="Veiksmai">
      <div className="panel-actions">
        <Link href={`/sale-windows/${saleWindow.id}/edit`} className="button">
          Redaguoti
        </Link>
        {commands.map((c) => (
          <button
            key={c}
            type="button"
            className={`button secondary${COMMANDS[c].danger ? ' danger' : ''}`}
            aria-pressed={selected === c}
            onClick={() => setSelected(selected === c ? null : c)}
            disabled={pending}
          >
            {COMMANDS[c].label}
          </button>
        ))}
      </div>

      {saleWindow.ordersCount > 0 ? (
        <p className="hint">
          Lange yra užsakymų ({saleWindow.ordersCount}), todėl grąžinti į juodraštį ar atšaukti jo
          negalima, kol jie neatšaukti.{' '}
          <Link href={`/orders?window=${saleWindow.id}`}>Lango užsakymai</Link>
        </p>
      ) : null}

      {info && selected ? (
        <form action={dispatch} className={`confirm${info.danger ? ' danger' : ''}`}>
          <input type="hidden" name="command" value={selected} />
          <p>
            <strong>{info.label}?</strong> {info.confirm}
          </p>
          <div className="panel-actions">
            <button
              type="submit"
              className={`button${info.danger ? ' danger-solid' : ''}`}
              disabled={pending}
            >
              {pending ? 'Vykdoma…' : info.confirmLabel}
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
        <div className="alert error" role="alert">
          <p>{state.error}</p>
          {state.overlap ? (
            <p>
              Kertasi su:{' '}
              <Link href={`/sale-windows/${state.overlap.id}`} className="strong">
                {state.overlap.title}
              </Link>{' '}
              ({formatShopDateTime(state.overlap.opensAt)} –{' '}
              {formatShopDateTime(state.overlap.closesAt)})
            </p>
          ) : null}
          {state.ordersHref ? (
            <p>
              <Link href={state.ordersHref} className="strong">
                Peržiūrėti lango užsakymus →
              </Link>
            </p>
          ) : null}
          {state.editHref ? (
            <p>
              <Link href={state.editHref} className="strong">
                Nurodyti atsiėmimo vietą ir laiką →
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

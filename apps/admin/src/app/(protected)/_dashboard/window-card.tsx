import {
  type AdminSaleWindowDto,
  formatPickupRange,
  formatRelativeShopTime,
  formatShopDateTime,
} from '@desert-web/shared';
import Link from 'next/link';
import { PhaseBadge } from '../sale-windows/phase-badge';
import { WindowActions } from '../sale-windows/window-actions';
import { stockLevel } from './window-pick';

/** Paprastas paaiškinimas, kada langas atsidaro / užsidaro. */
function timingHint(w: AdminSaleWindowDto, now: Date): string {
  switch (w.phase) {
    case 'open':
      return `Uždaroma ${formatRelativeShopTime(w.closesAt, now)}`;
    case 'upcoming':
      return `Atsidaro ${formatRelativeShopTime(w.opensAt, now)}`;
    case 'closed':
      return `Uždarytas ${formatRelativeShopTime(w.closesAt, now)}`;
    case 'draft':
      return 'Juodraštis: pirkėjai jo dar nemato';
    case 'cancelled':
      return 'Langas atšauktas';
  }
}

const STOCK_LABELS = { 'sold-out': 'Išparduota', low: 'Mažai liko' } as const;

export function DashboardWindowCard({
  saleWindow: w,
  now,
}: {
  saleWindow: AdminSaleWindowDto;
  now: Date;
}) {
  const f = w.fulfillment;
  return (
    <section className="dash-card window-card" aria-labelledby="dash-window-title">
      <div className="dash-card-header">
        <h2 id="dash-window-title">
          <Link href={`/sale-windows/${w.id}`}>{w.title}</Link>
        </h2>
        <PhaseBadge phase={w.phase} />
      </div>
      <p className={`timing-hint phase-${w.phase}`}>{timingHint(w, now)}</p>

      <dl className="dash-facts">
        <div>
          <dt>Atidaroma</dt>
          <dd>{formatShopDateTime(w.opensAt)}</dd>
        </div>
        <div>
          <dt>Uždaroma</dt>
          <dd>{formatShopDateTime(w.closesAt)}</dd>
        </div>
        <div className="wide">
          <dt>Atsiėmimas</dt>
          <dd>
            {f.pickupLocation || f.pickupFrom ? (
              <>
                {f.pickupLocation ?? 'Vieta nenurodyta'}
                {f.pickupFrom && f.pickupTo ? (
                  <span className="muted small">{formatPickupRange(f.pickupFrom, f.pickupTo)}</span>
                ) : null}
              </>
            ) : (
              <>
                Nenurodyta{' '}
                <Link href={`/sale-windows/${w.id}/edit`} className="link">
                  Nurodyti
                </Link>
              </>
            )}
          </dd>
        </div>
      </dl>

      {/* key: po veiksmo (redirect į apžvalgą) patvirtinimo būsena išvaloma. */}
      <WindowActions key={w.updatedAt} saleWindow={w} variant="dashboard" />

      {w.items.length > 0 ? (
        <>
          <h3 className="dash-subtitle">Prekės</h3>
          <ul className="stock-list">
            {w.items.map((i) => {
              const level = stockLevel(i);
              const soldPercent =
                i.quantityTotal > 0 ? Math.round((i.sold / i.quantityTotal) * 100) : 0;
              return (
                <li key={i.variantId} className={`stock-item stock-${level}`}>
                  <div className="stock-name">
                    <span className="strong">{i.productName}</span>
                    <span className="muted small">{i.variantName}</span>
                    {level !== 'ok' ? (
                      <span className={`badge stock-badge stock-${level}`}>
                        {STOCK_LABELS[level]}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="stock-bar"
                    role="img"
                    aria-label={`Parduota ${i.sold} iš ${i.quantityTotal}`}
                  >
                    <span style={{ width: `${soldPercent}%` }} />
                  </div>
                  <p className="stock-numbers small">
                    Parduota <strong>{i.sold}</strong> · Liko <strong>{i.quantityAvailable}</strong>{' '}
                    · Iš viso {i.quantityTotal}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="muted">Lange dar nėra prekių.</p>
      )}

      <div className="panel-actions">
        <Link href={`/sale-windows/${w.id}`} className="button secondary small">
          Lango puslapis
        </Link>
        <Link href={`/orders?window=${w.id}`} className="button secondary small">
          Užsakymai ({w.ordersCount})
        </Link>
      </div>
    </section>
  );
}

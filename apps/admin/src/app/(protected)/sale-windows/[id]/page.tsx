import { formatEur, formatShopDateTime } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchSaleWindow, quantitySummary } from '../data';
import { PhaseBadge } from '../phase-badge';
import { WindowActions } from '../window-actions';

export const metadata: Metadata = { title: 'Pardavimo langas · Desert Web Admin' };

const DONE_MESSAGES: Record<string, string> = {
  created: 'Langas sukurtas kaip juodraštis.',
  saved: 'Pakeitimai išsaugoti.',
  publish: 'Langas paskelbtas.',
  unpublish: 'Langas grąžintas į juodraštį.',
  'open-now': 'Langas atidarytas: užsakymai priimami.',
  'close-now': 'Langas uždarytas: užsakymai nebepriimami.',
  cancel: 'Langas atšauktas.',
};

export default async function SaleWindowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ id }, { done }] = await Promise.all([params, searchParams]);
  const w = await fetchSaleWindow(id);
  const doneMessage = done ? DONE_MESSAGES[done] : undefined;
  const { sold, total } = quantitySummary(w);
  const f = w.fulfillment;

  return (
    <>
      <p className="breadcrumbs">
        <Link href="/sale-windows">← Pardavimo langai</Link>
      </p>
      <div className="page-header">
        <h1>{w.title}</h1>
        <PhaseBadge phase={w.phase} />
      </div>

      {doneMessage ? (
        <p className="alert success" role="status">
          {doneMessage}
        </p>
      ) : null}
      {w.phase === 'cancelled' ? (
        <p className="alert info">Atšauktas langas tik skaitomas.</p>
      ) : null}

      {/* key: po veiksmo (redirect į tą patį puslapį) patvirtinimo būsena išvaloma. */}
      <WindowActions key={w.updatedAt} saleWindow={w} />

      <dl className="summary">
        <div>
          <dt>Atidaroma</dt>
          <dd>{formatShopDateTime(w.opensAt)}</dd>
        </div>
        <div>
          <dt>Uždaroma</dt>
          <dd>{formatShopDateTime(w.closesAt)}</dd>
        </div>
        <div>
          <dt>Užsakymai</dt>
          <dd>{w.ordersCount}</dd>
        </div>
        <div>
          <dt>Parduota</dt>
          <dd>
            {sold} / {total} vnt.
          </dd>
        </div>
        <div>
          <dt>Atsiėmimas</dt>
          <dd>
            {f.pickupAvailable ? (
              <>
                {f.pickupLocation ?? 'Taip'}
                {f.pickupFrom && f.pickupTo ? (
                  <span className="muted small">
                    {formatShopDateTime(f.pickupFrom)} – {formatShopDateTime(f.pickupTo)}
                  </span>
                ) : null}
              </>
            ) : (
              'Ne'
            )}
          </dd>
        </div>
        <div>
          <dt>Pristatymas</dt>
          <dd>{f.deliveryAvailable ? 'Taip' : 'Ne'}</dd>
        </div>
      </dl>

      <h2>Prekės</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Prekė</th>
              <th scope="col">Kaina</th>
              <th scope="col">Parduota</th>
              <th scope="col">Likutis</th>
              <th scope="col">Limitai</th>
            </tr>
          </thead>
          <tbody>
            {w.items.map((i) => (
              <tr key={i.variantId}>
                <td>
                  <span className="strong">{i.productName}</span>
                  <span className="muted small">
                    {i.variantName}
                    {i.productActive ? '' : ' · produktas archyvuotas'}
                  </span>
                </td>
                <td className="nowrap">{formatEur(i.priceCents)}</td>
                <td className="nowrap">
                  {i.sold} / {i.quantityTotal}
                  <span className="muted small">užsakymų: {i.ordersCount}</span>
                </td>
                <td>{i.quantityAvailable}</td>
                <td className="nowrap stack">
                  {i.maxPerOrder || i.maxPerCustomer ? (
                    <>
                      {i.maxPerOrder ? (
                        <span className="small">užsakymui: {i.maxPerOrder}</span>
                      ) : null}
                      {i.maxPerCustomer ? (
                        <span className="small">pirkėjui: {i.maxPerCustomer}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

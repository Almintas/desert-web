import {
  formatEur,
  formatShopDateTime,
  ORDER_STATUSES,
  type OrderStatus,
} from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchOrders, fetchWindowsForFilter } from './data';
import { FULFILLMENT_LABELS, ORDER_STATUS_TABS } from './labels';
import { OrderStatusBadge } from './status-badge';

export const metadata: Metadata = { title: 'Užsakymai' };

const PAGE_SIZE = 20;
const ALL_WINDOWS = 'all';

interface SearchParams {
  window?: string;
  status?: string;
  q?: string;
  page?: string;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const windows = await fetchWindowsForFilter();

  // Numatytasis langas: šiuo metu atidarytas, kitaip naujausias (sąrašas jau pagal opensAt).
  const defaultWindow = windows.find((w) => w.phase === 'open') ?? windows[0];
  const windowId =
    params.window === ALL_WINDOWS
      ? undefined
      : (windows.find((w) => w.id === params.window) ?? defaultWindow)?.id;
  const status = ORDER_STATUSES.includes(params.status as OrderStatus)
    ? (params.status as OrderStatus)
    : undefined;
  const q = params.q?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const result = await fetchOrders({
    ...(windowId ? { saleWindowId: windowId } : {}),
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  /** Nuoroda, išlaikanti kitus filtrus. */
  const href = (patch: Partial<Record<keyof SearchParams, string | undefined>>) => {
    const next: Record<string, string | undefined> = {
      window: windowId ?? ALL_WINDOWS,
      status,
      q: q || undefined,
      ...patch,
    };
    const qs = new URLSearchParams(
      Object.entries(next).filter((e): e is [string, string] => Boolean(e[1])),
    ).toString();
    return `/orders${qs ? `?${qs}` : ''}`;
  };

  return (
    <>
      <div className="page-header">
        <h1>Užsakymai</h1>
      </div>

      <form method="get" className="filters" role="search">
        <label>
          Pardavimo langas
          <select name="window" defaultValue={windowId ?? ALL_WINDOWS}>
            <option value={ALL_WINDOWS}>Visi langai</option>
            {windows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} ({formatShopDateTime(w.opensAt)})
              </option>
            ))}
          </select>
        </label>
        <label>
          Paieška
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nr., vardas, el. paštas ar telefonas"
          />
        </label>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <button type="submit" className="button">
          Rodyti
        </button>
      </form>

      <nav className="tabs" aria-label="Būsena">
        {ORDER_STATUS_TABS.map((t) => {
          const active = (t.status === 'all' && !status) || t.status === status;
          return (
            <Link
              key={t.status}
              href={href({ status: t.status === 'all' ? undefined : t.status, page: undefined })}
              className={active ? 'tab active' : 'tab'}
              aria-current={active ? 'page' : undefined}
            >
              {t.label} <span className="count">{result.counts[t.status]}</span>
            </Link>
          );
        })}
      </nav>

      {result.items.length === 0 ? (
        <p className="muted">{q ? 'Pagal paiešką užsakymų nerasta.' : 'Užsakymų nėra.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nr.</th>
                <th scope="col">Būsena</th>
                <th scope="col">Pirkėjas</th>
                <th scope="col">Suma</th>
                <th scope="col">Vnt.</th>
                <th scope="col">Būdas</th>
                {windowId ? null : <th scope="col">Langas</th>}
              </tr>
            </thead>
            <tbody>
              {result.items.map((o) => (
                <tr key={o.id}>
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
                  {windowId ? null : (
                    <td>
                      <Link href={`/sale-windows/${o.saleWindow.id}`}>{o.saleWindow.title}</Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="pagination" aria-label="Puslapiai">
          {page > 1 ? (
            <Link href={href({ page: String(page - 1) })} className="button secondary small">
              ← Ankstesnis
            </Link>
          ) : null}
          <span className="muted">
            Puslapis {page} iš {pages} · {result.total} užs.
          </span>
          {page < pages ? (
            <Link href={href({ page: String(page + 1) })} className="button secondary small">
              Kitas →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

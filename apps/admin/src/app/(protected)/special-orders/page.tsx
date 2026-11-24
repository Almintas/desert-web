import {
  ACTIVE_SPECIAL_ORDER_STATUSES,
  formatCalendarDate,
  formatEur,
  formatShopDateTime,
  isCalendarDate,
  SPECIAL_ORDER_STATUSES,
  type SpecialOrderStatus,
} from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchSpecialOrders } from './data';
import { SPECIAL_ORDER_TABS, type SpecialOrderTab } from './labels';
import { SpecialOrderStatusBadge } from './status-badge';

export const metadata: Metadata = { title: 'Specialūs užsakymai' };

const PAGE_SIZE = 20;

interface SearchParams {
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
}

function parseTab(value: string | undefined): SpecialOrderTab {
  if (value === 'all') return 'all';
  if (SPECIAL_ORDER_STATUSES.includes(value as SpecialOrderStatus)) {
    return value as SpecialOrderStatus;
  }
  return 'active';
}

export default async function SpecialOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tab = parseTab(params.status);
  const from = params.from && isCalendarDate(params.from) ? params.from : undefined;
  const to = params.to && isCalendarDate(params.to) ? params.to : undefined;
  const q = params.q?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const statusFilter =
    tab === 'all' ? undefined : tab === 'active' ? ACTIVE_SPECIAL_ORDER_STATUSES.join(',') : tab;
  const result = await fetchSpecialOrders({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(from ? { desiredFrom: from } : {}),
    ...(to ? { desiredTo: to } : {}),
    ...(q ? { q } : {}),
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const tabCount = (t: SpecialOrderTab) =>
    t === 'active' ? result.counts.requested + result.counts.confirmed : result.counts[t];

  /** Nuoroda, išlaikanti kitus filtrus. */
  const href = (patch: Partial<Record<keyof SearchParams, string | undefined>>) => {
    const next: Record<string, string | undefined> = {
      status: tab === 'active' ? undefined : tab,
      from,
      to,
      q: q || undefined,
      ...patch,
    };
    const qs = new URLSearchParams(
      Object.entries(next).filter((e): e is [string, string] => Boolean(e[1])),
    ).toString();
    return `/special-orders${qs ? `?${qs}` : ''}`;
  };

  return (
    <>
      <div className="page-header">
        <h1>Specialūs užsakymai</h1>
      </div>

      <form method="get" className="filters" role="search">
        <label>
          Paieška
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nr., vardas, el. paštas ar telefonas"
          />
        </label>
        <label className="date-filter">
          Pageidaujama data nuo
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label className="date-filter">
          iki
          <input type="date" name="to" defaultValue={to} />
        </label>
        {tab !== 'active' ? <input type="hidden" name="status" value={tab} /> : null}
        <button type="submit" className="button">
          Rodyti
        </button>
      </form>

      <nav className="tabs" aria-label="Būsena">
        {SPECIAL_ORDER_TABS.map((t) => {
          const active = t.tab === tab;
          return (
            <Link
              key={t.tab}
              href={href({ status: t.tab === 'active' ? undefined : t.tab, page: undefined })}
              className={active ? 'tab active' : 'tab'}
              aria-current={active ? 'page' : undefined}
            >
              {t.label} <span className="count">{tabCount(t.tab)}</span>
            </Link>
          );
        })}
      </nav>

      {result.items.length === 0 ? (
        <p className="muted">
          {q || from || to ? 'Pagal filtrus užklausų nerasta.' : 'Užklausų nėra.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nr.</th>
                <th scope="col">Būsena</th>
                <th scope="col">Pirkėjas</th>
                <th scope="col">Pageidaujama data</th>
                <th scope="col">Prekės</th>
                <th scope="col">Suma</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((o) => (
                <tr key={o.id}>
                  <td className="nowrap">
                    <Link href={`/special-orders/${o.id}`} className="strong">
                      {o.requestNumber}
                    </Link>
                    <span className="muted small">{formatShopDateTime(o.createdAt)}</span>
                  </td>
                  <td>
                    <SpecialOrderStatusBadge status={o.status} />
                  </td>
                  <td>
                    {o.customer.name}
                    <span className="muted small nowrap">{o.customer.phone}</span>
                  </td>
                  <td className="nowrap">{formatCalendarDate(o.desiredDate)}</td>
                  <td>
                    <ul className="item-summary">
                      {o.items.map((i, index) => (
                        <li key={index}>
                          {i.productName} <span className="muted">{i.variantName}</span>{' '}
                          <span className="nowrap">× {i.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="nowrap">
                    {o.totalCents !== null ? (
                      <>
                        <span className="strong">{formatEur(o.totalCents)}</span>
                        <span className="muted small">
                          apskaičiuota {formatEur(o.estimatedTotalCents)}
                        </span>
                      </>
                    ) : (
                      <>
                        ≈ {formatEur(o.estimatedTotalCents)}
                        <span className="muted small">apskaičiuota</span>
                      </>
                    )}
                  </td>
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
            Puslapis {page} iš {pages} · {result.total} užkl.
          </span>
          {page < pages ? (
            <Link href={href({ page: String(page + 1) })} className="button secondary small">
              Kitas →
            </Link>
          ) : null}
        </nav>
      ) : null}
      <p className="hint">Rikiuojama pagal pageidaujamą datą: artimiausios pirmos.</p>
    </>
  );
}

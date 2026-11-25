import { type AdminDto, formatShopDate } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import { CreateAdminForm } from './_admins/create-admin-form';
import { ROLE_LABELS } from './_admins/form-state';
import { DashboardWindowCard } from './_dashboard/window-card';
import { pickDashboardWindow, windowsWithPickupToday } from './_dashboard/window-pick';
import { fetchOrders } from './orders/data';
import { fetchSaleWindows } from './sale-windows/data';
import { fetchRequestedCount } from './special-orders/data';

export const metadata: Metadata = { title: 'Apžvalga' };

const DONE_MESSAGES: Record<string, string> = {
  'open-now': 'Langas atidarytas: užsakymai priimami.',
  'close-now': 'Langas uždarytas: užsakymai nebepriimami.',
};

function Counter({
  href,
  count,
  label,
  attention,
}: {
  href: string;
  count: number | null;
  label: string;
  /** Paryškinti, kai yra ką daryti (count > 0). */
  attention?: boolean;
}) {
  const active = attention && (count ?? 0) > 0;
  return (
    <li>
      <Link href={href} className={`counter${active ? ' attention' : ''}`}>
        <span className="counter-value">{count ?? '–'}</span>
        <span className="counter-label">{label}</span>
      </Link>
    </li>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  // Layout'as navigacijos metu nebūtinai perpiešiamas, todėl tikrinam ir puslapyje.
  const admin = await requireAdmin();
  const isOwner = admin.role === 'owner';
  const token = await getSessionToken();
  const [{ done }, windows, orders, requested, admins] = await Promise.all([
    searchParams,
    fetchSaleWindows(),
    // Tik skaičiai pagal būseną (visuose languose).
    fetchOrders({ pageSize: '1' }),
    fetchRequestedCount(),
    isOwner ? apiFetch<AdminDto[]>('/admin/admins', { token }) : Promise.resolve([]),
  ]);
  const now = new Date();
  const current = pickDashboardWindow(windows);
  // Atsiėmimas šiandien: mygtukas į sąrašą, jei lange yra patvirtintų ar paruoštų užsakymų.
  const pickups = (
    await Promise.all(
      windowsWithPickupToday(windows, now).map(async (w) => {
        const { counts } = await fetchOrders({ saleWindowId: w.id, pageSize: '1' });
        return { window: w, waiting: counts.confirmed + counts.ready };
      }),
    )
  ).filter((p) => p.waiting > 0);
  const doneMessage = done ? DONE_MESSAGES[done] : undefined;

  return (
    <>
      <div className="page-header">
        <h1>Apžvalga</h1>
      </div>

      {doneMessage ? (
        <p className="alert success" role="status">
          {doneMessage}
        </p>
      ) : null}

      {pickups.map(({ window: w, waiting }) => (
        <Link key={w.id} href={`/sale-windows/${w.id}/pickup`} className="pickup-cta">
          <span className="pickup-cta-title">Atsiėmimo sąrašas</span>
          <span className="pickup-cta-text">
            Šiandien atsiėmimas: {w.title} · laukia {waiting} užs.
          </span>
        </Link>
      ))}

      <ul className="counters" aria-label="Laukia veiksmų">
        <Counter
          href="/orders?window=all&status=pending"
          count={orders.counts.pending}
          label="Laukia patvirtinimo"
          attention
        />
        <Counter
          href="/orders?window=all&status=ready"
          count={orders.counts.ready}
          label="Paruošti atsiėmimui"
        />
        <Counter
          href="/special-orders?status=requested"
          count={requested}
          label="Naujos specialios užklausos"
          attention
        />
      </ul>

      {current ? (
        <DashboardWindowCard saleWindow={current} now={now} />
      ) : (
        <section className="dash-card empty-state">
          <h2>Pardavimo langų dar nėra</h2>
          <p className="muted">
            Sukurk pirmą pardavimo langą: pasirink prekes, kiekius ir laiką, kada priimami
            užsakymai.
          </p>
          <p>
            <Link href="/sale-windows/new" className="button">
              Sukurti pardavimo langą
            </Link>
          </p>
        </section>
      )}

      {isOwner ? (
        <section className="group admins">
          <h2>Administratoriai</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">El. paštas</th>
                  <th scope="col">Rolė</th>
                  <th scope="col">Sukurtas</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.email}
                      {a.id === admin.id ? <span className="muted"> (tu)</span> : null}
                    </td>
                    <td>{ROLE_LABELS[a.role]}</td>
                    <td>{formatShopDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CreateAdminForm />
        </section>
      ) : null}
    </>
  );
}

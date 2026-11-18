import {
  type AdminSaleWindowDto,
  formatShopDateTime,
  type SaleWindowPhase,
} from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchSaleWindows, quantitySummary } from './data';
import { PhaseBadge } from './phase-badge';

export const metadata: Metadata = { title: 'Pardavimo langai · Desert Web Admin' };

const GROUPS: { phase: SaleWindowPhase; title: string; empty?: string }[] = [
  { phase: 'open', title: 'Vyksta dabar', empty: 'Šiuo metu atidaryto lango nėra.' },
  { phase: 'upcoming', title: 'Būsimi' },
  { phase: 'draft', title: 'Juodraščiai' },
  { phase: 'closed', title: 'Pasibaigę' },
];

const DONE_MESSAGES: Record<string, string> = {
  deleted: 'Juodraštis ištrintas.',
};

function WindowsTable({ windows }: { windows: AdminSaleWindowDto[] }) {
  return (
    <div className="table-wrap">
      <table className="table windows-table">
        <thead>
          <tr>
            <th scope="col">Pavadinimas</th>
            <th scope="col">Atidaroma</th>
            <th scope="col">Uždaroma</th>
            <th scope="col">Būsena</th>
            <th scope="col">Užsakymai</th>
            <th scope="col">Parduota</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((w) => {
            const { sold, total } = quantitySummary(w);
            return (
              <tr key={w.id}>
                <td>
                  <Link href={`/sale-windows/${w.id}`} className="strong">
                    {w.title}
                  </Link>
                  <span className="muted small">{w.items.length} prek.</span>
                </td>
                <td className="nowrap">{formatShopDateTime(w.opensAt)}</td>
                <td className="nowrap">{formatShopDateTime(w.closesAt)}</td>
                <td>
                  <PhaseBadge phase={w.phase} />
                </td>
                <td>{w.ordersCount}</td>
                <td className="nowrap">
                  {sold} / {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function SaleWindowsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const [windows, { done }] = await Promise.all([fetchSaleWindows(), searchParams]);
  const doneMessage = done ? DONE_MESSAGES[done] : undefined;
  const cancelled = windows.filter((w) => w.phase === 'cancelled');

  return (
    <>
      <div className="page-header">
        <h1>Pardavimo langai</h1>
        <Link href="/sale-windows/new" className="button">
          Naujas langas
        </Link>
      </div>
      <p className="muted page-intro">Laikai rodomi Lietuvos laiku.</p>

      {doneMessage ? (
        <p className="alert success" role="status">
          {doneMessage}
        </p>
      ) : null}

      {windows.length === 0 ? (
        <p className="muted">Langų dar nėra. Sukurk pirmą.</p>
      ) : (
        <>
          {GROUPS.map((g) => {
            const group = windows.filter((w) => w.phase === g.phase);
            if (group.length === 0 && !g.empty) return null;
            return (
              <section key={g.phase} className="group">
                <h2>
                  {g.title} <span className="muted">({group.length})</span>
                </h2>
                {group.length > 0 ? (
                  <WindowsTable windows={group} />
                ) : (
                  <p className="muted">{g.empty}</p>
                )}
              </section>
            );
          })}
          {cancelled.length > 0 ? (
            <details className="group">
              <summary>
                <h2>
                  Atšaukti <span className="muted">({cancelled.length})</span>
                </h2>
              </summary>
              <WindowsTable windows={cancelled} />
            </details>
          ) : null}
        </>
      )}
    </>
  );
}

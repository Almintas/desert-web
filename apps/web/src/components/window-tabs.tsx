import type { PublicSaleWindowDto } from '@desert-web/shared';
import Link from 'next/link';
import { formatDateTime } from '@/lib/format';

/** Kelių vienu metu vykstančių pardavimų perjungimas (rodoma tik kai jų daugiau nei vienas). */
export function WindowTabs({
  windows,
  activeId,
}: {
  windows: PublicSaleWindowDto[];
  activeId: string;
}) {
  if (windows.length < 2) return null;
  return (
    <nav className="window-tabs" aria-label="Vykstantys pardavimai">
      <ul>
        {windows.map((w) => (
          <li key={w.id}>
            <Link
              href={`/?langas=${encodeURIComponent(w.id)}`}
              className="window-tab"
              aria-current={w.id === activeId ? 'page' : undefined}
            >
              <span className="window-tab-title">{w.title}</span>
              <span className="window-tab-meta">iki {formatDateTime(w.closesAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

import { formatEur, type ProductDto } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';

export const metadata: Metadata = { title: 'Produktai · Desert Web Admin' };

const SAVED_MESSAGES: Record<string, string> = {
  created: 'Produktas sukurtas.',
  updated: 'Pakeitimai išsaugoti.',
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const token = await getSessionToken();
  const [products, { saved }] = await Promise.all([
    apiFetch<ProductDto[]>('/admin/products', { token }),
    searchParams,
  ]);
  const savedMessage = saved ? SAVED_MESSAGES[saved] : undefined;

  return (
    <>
      <div className="page-header">
        <h1>Produktai</h1>
        <Link href="/products/new" className="button">
          Naujas produktas
        </Link>
      </div>

      {savedMessage ? (
        <p className="alert success" role="status">
          {savedMessage}
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="muted">Produktų dar nėra. Sukurk pirmą.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Pavadinimas</th>
                <th scope="col">Kategorija</th>
                <th scope="col">Variantai</th>
                <th scope="col">Būsena</th>
                <th scope="col">
                  <span className="visually-hidden">Veiksmai</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/products/${p.id}`} className="strong">
                      {p.name}
                    </Link>
                    <span className="muted small">/{p.slug}</span>
                  </td>
                  <td>{p.category}</td>
                  <td>
                    <ul className="variant-list">
                      {p.variants.map((v) => (
                        <li key={v.id}>
                          {v.name} <span className="muted">· {formatEur(v.priceCents)}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    {p.isActive ? (
                      <span className="badge active">Aktyvus</span>
                    ) : (
                      <span className="badge archived">Archyvuotas</span>
                    )}
                  </td>
                  <td className="actions">
                    <Link href={`/products/${p.id}`} className="button secondary small">
                      Redaguoti
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

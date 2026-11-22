import { type AdminProductDto, cloudinaryImageUrl, formatEur } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';

export const metadata: Metadata = { title: 'Produktai' };

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
    apiFetch<AdminProductDto[]>('/admin/products', { token }),
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
                <th scope="col" className="thumb-cell">
                  <span className="visually-hidden">Nuotrauka</span>
                </th>
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
                  <td className="thumb-cell">
                    {p.images[0] ? (
                      // Paprastas img: dydį ir formatą parenka Cloudinary (f_auto).
                      <img
                        className="thumb"
                        src={cloudinaryImageUrl(p.images[0].url, { width: 112, height: 112 })}
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                      />
                    ) : (
                      <span className="thumb placeholder" aria-hidden="true" />
                    )}
                  </td>
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

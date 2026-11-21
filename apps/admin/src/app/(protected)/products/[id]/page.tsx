import type { AdminProductDto } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import { categoriesOf } from '../categories';
import { ProductForm } from '../product-form';
import { ProductImages } from '../product-images';

export const metadata: Metadata = { title: 'Produktas · Desert Web Admin' };

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; imageErrors?: string }>;
}) {
  await requireAdmin();
  const token = await getSessionToken();
  const [{ id }, { created, imageErrors }] = await Promise.all([params, searchParams]);
  const failedImages = Number(imageErrors) || 0;

  const [product, products] = await Promise.all([
    apiFetch<AdminProductDto>(`/admin/products/${encodeURIComponent(id)}`, { token }).catch(
      (error: unknown) => {
        if (error instanceof ApiError && error.status === 404) notFound();
        throw error;
      },
    ),
    apiFetch<AdminProductDto[]>('/admin/products', { token }),
  ]);

  return (
    <>
      <p className="breadcrumbs">
        <Link href="/products">← Produktai</Link>
      </p>
      <div className="page-header">
        <h1>{product.name}</h1>
        {product.isActive ? null : <span className="badge archived">Archyvuotas</span>}
      </div>
      {created && failedImages > 0 ? (
        <p className="alert error" role="alert">
          Produktas sukurtas, bet {failedImages} {failedImages === 1 ? 'nuotraukos' : 'nuotraukų'}{' '}
          įkelti nepavyko. Pabandyk pridėti dar kartą.
        </p>
      ) : created ? (
        <p className="alert success" role="status">
          {product.images.length > 0
            ? 'Produktas sukurtas.'
            : 'Produktas sukurtas. Dabar pridėk nuotraukų: pirmoji bus pagrindinė.'}
        </p>
      ) : null}
      <ProductImages
        productId={product.id}
        productName={product.name}
        initialImages={product.images}
      />
      {/* key: po išsaugojimo ir grįžimo forma inicializuojama iš naujų duomenų. */}
      <ProductForm
        key={product.updatedAt}
        productId={product.id}
        initial={product}
        categories={categoriesOf(products)}
      />
    </>
  );
}

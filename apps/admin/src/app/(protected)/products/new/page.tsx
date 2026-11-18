import type { ProductDto } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import { categoriesOf } from '../categories';
import { ProductForm } from '../product-form';

export const metadata: Metadata = { title: 'Naujas produktas · Desert Web Admin' };

export default async function NewProductPage() {
  await requireAdmin();
  const token = await getSessionToken();
  const products = await apiFetch<ProductDto[]>('/admin/products', { token });

  return (
    <>
      <p className="breadcrumbs">
        <Link href="/products">← Produktai</Link>
      </p>
      <h1>Naujas produktas</h1>
      <ProductForm productId={null} categories={categoriesOf(products)} />
    </>
  );
}

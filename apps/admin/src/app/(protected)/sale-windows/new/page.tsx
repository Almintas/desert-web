import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchProductOptions } from '../data';
import { SaleWindowForm } from '../sale-window-form';

export const metadata: Metadata = { title: 'Naujas langas' };

export default async function NewSaleWindowPage() {
  const products = await fetchProductOptions();
  return (
    <>
      <p className="breadcrumbs">
        <Link href="/sale-windows">← Pardavimo langai</Link>
      </p>
      <h1>Naujas pardavimo langas</h1>
      <p className="muted page-intro">
        Langas sukuriamas kaip juodraštis. Paskelbti galėsi vėliau.
      </p>
      <SaleWindowForm windowId={null} products={products} />
    </>
  );
}

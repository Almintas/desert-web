import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchProductOptions, fetchSaleWindow } from '../../data';
import { PhaseBadge } from '../../phase-badge';
import { SaleWindowForm } from '../../sale-window-form';

export const metadata: Metadata = { title: 'Redaguoti langą' };

export default async function EditSaleWindowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [saleWindow, products] = await Promise.all([fetchSaleWindow(id), fetchProductOptions()]);
  // Atšauktas langas tik skaitomas.
  if (saleWindow.status === 'cancelled') redirect(`/sale-windows/${id}`);

  return (
    <>
      <p className="breadcrumbs">
        <Link href={`/sale-windows/${id}`}>← {saleWindow.title}</Link>
      </p>
      <div className="page-header">
        <h1>Redaguoti langą</h1>
        <PhaseBadge phase={saleWindow.phase} />
      </div>
      {saleWindow.phase === 'open' ? (
        <p className="alert info">
          Langas šiuo metu atidarytas. Kiekių ir kainų pakeitimai galios naujiems užsakymams.
        </p>
      ) : null}
      {/* key: po išsaugojimo forma inicializuojama iš naujų duomenų. */}
      <SaleWindowForm
        key={saleWindow.updatedAt}
        windowId={saleWindow.id}
        initial={saleWindow}
        products={products}
      />
    </>
  );
}

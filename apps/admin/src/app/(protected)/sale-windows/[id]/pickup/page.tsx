import { formatPickupInfo } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchPickupInfo, fetchPickupList, fetchSaleWindow } from '../../data';
import { PickupList } from './pickup-list';

export const metadata: Metadata = { title: 'Atsiėmimo sąrašas' };

export default async function PickupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [w, orders, pickup] = await Promise.all([
    fetchSaleWindow(id),
    fetchPickupList(id),
    fetchPickupInfo(),
  ]);

  return (
    <>
      <p className="breadcrumbs screen-only">
        <Link href={`/sale-windows/${w.id}`}>← {w.title}</Link>
      </p>
      <div className="page-header pickup-header">
        <h1>Atsiėmimo sąrašas</h1>
        <p className="muted">
          {w.title}
          {pickup ? ` · ${formatPickupInfo(pickup)}` : ''}
        </p>
      </div>
      <PickupList orders={orders} windowId={w.id} />
    </>
  );
}

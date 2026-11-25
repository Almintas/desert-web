import { formatPickupRange } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchPickupList, fetchSaleWindow } from '../../data';
import { PickupList } from './pickup-list';

export const metadata: Metadata = { title: 'Atsiėmimo sąrašas' };

export default async function PickupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [w, orders] = await Promise.all([fetchSaleWindow(id), fetchPickupList(id)]);
  const f = w.fulfillment;

  return (
    <>
      <p className="breadcrumbs screen-only">
        <Link href={`/sale-windows/${w.id}`}>← {w.title}</Link>
      </p>
      <div className="page-header pickup-header">
        <h1>Atsiėmimo sąrašas</h1>
        <p className="muted">
          {w.title}
          {f.pickupLocation ? ` · ${f.pickupLocation}` : ''}
          {f.pickupFrom && f.pickupTo ? ` · ${formatPickupRange(f.pickupFrom, f.pickupTo)}` : ''}
        </p>
      </div>
      <PickupList orders={orders} windowId={w.id} />
    </>
  );
}

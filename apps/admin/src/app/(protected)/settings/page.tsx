import type { SettingsDto } from '@desert-web/shared';
import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import { SettingsForm } from './settings-form';
import { ShopInfoForm } from './shop-info-form';

export const metadata: Metadata = { title: 'Nustatymai' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const admin = await requireAdmin();
  const [{ done }, settings] = await Promise.all([
    searchParams,
    apiFetch<SettingsDto>('/admin/settings', { token: await getSessionToken() }),
  ]);

  return (
    <>
      <div className="page-header">
        <h1>Nustatymai</h1>
      </div>
      {done === 'saved' ? (
        <p className="alert success" role="status">
          Nustatymai išsaugoti.
        </p>
      ) : null}
      {done === 'shop' ? (
        <p className="alert success" role="status">
          Parduotuvės informacija išsaugota. Svetainėje ji atsinaujins maždaug per minutę.
        </p>
      ) : null}
      {/* key: po išsaugojimo forma pradedama nuo naujų reikšmių. */}
      <SettingsForm
        key={settings.updatedAt ?? 'default'}
        initial={settings.specialOrders}
        canEdit={admin.role === 'owner'}
      />
      <ShopInfoForm
        key={`shop-${settings.updatedAt ?? 'default'}`}
        initial={settings.shop}
        canEdit={admin.role === 'owner'}
      />
    </>
  );
}

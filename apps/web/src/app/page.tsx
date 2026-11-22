import type { Metadata } from 'next';
import { PickupInfo } from '@/components/pickup-info';
import { Storefront, UpcomingProducts } from '@/components/storefront';
import { WindowTabs } from '@/components/window-tabs';
import { formatDateTime, formatDateTimeWithWeekday } from '@/lib/format';
import { SHOP_DESCRIPTION, SHOP_NAME } from '@/lib/shop';
import { loadCurrentWindows, pickOpenWindow, WINDOW_PARAM } from '@/lib/window';

// Lango būsena ir likučiai priklauso nuo laiko, todėl puslapis visada generuojamas iš naujo.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: `${SHOP_NAME}: rankų darbo desertai` },
  description: SHOP_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'lt_LT',
    siteName: SHOP_NAME,
    title: `${SHOP_NAME}: rankų darbo desertai`,
    description: SHOP_DESCRIPTION,
    url: '/',
  },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [current, params] = await Promise.all([loadCurrentWindows(), searchParams]);

  if (!current) {
    return (
      <section className="notice">
        <h1>Šiuo metu nepavyksta pasiekti parduotuvės</h1>
        <p>Pabandykite dar kartą po kelių minučių.</p>
      </section>
    );
  }

  const { upcoming, openWindows } = current;
  const open = pickOpenWindow(current, params[WINDOW_PARAM]);

  if (open) {
    return (
      <>
        <WindowTabs windows={openWindows} activeId={open.id} />
        <header className="window-header">
          <p className="eyebrow">Prekyba vyksta</p>
          <h1>{open.title}</h1>
          <p className="window-closes">
            Užsakymai priimami iki <strong>{formatDateTime(open.closesAt)}</strong>
          </p>
          <PickupInfo
            location={open.fulfillment.pickupLocation}
            from={open.fulfillment.pickupFrom}
            to={open.fulfillment.pickupTo}
          />
        </header>
        {open.items.length > 0 ? (
          <Storefront key={open.id} saleWindow={open} openCount={openWindows.length} />
        ) : (
          <p className="notice">Prekės netrukus atsiras.</p>
        )}
      </>
    );
  }

  if (upcoming) {
    return (
      <>
        <header className="window-header upcoming">
          <p className="eyebrow">Netrukus</p>
          <h1>{upcoming.title}</h1>
          <p className="window-closes">
            Prekyba prasidės <strong>{formatDateTimeWithWeekday(upcoming.opensAt)}</strong>
          </p>
          <p className="muted">
            Kol kas galite apžiūrėti, ką ruošiame. Užsakyti bus galima prasidėjus prekybai.
          </p>
          <PickupInfo
            location={upcoming.fulfillment.pickupLocation}
            from={upcoming.fulfillment.pickupFrom}
            to={upcoming.fulfillment.pickupTo}
          />
        </header>
        <UpcomingProducts saleWindow={upcoming} />
      </>
    );
  }

  return (
    <section className="notice">
      <p className="notice-icon" aria-hidden="true">
        🍰
      </p>
      <h1>Šiuo metu užsakymų nepriimame</h1>
      <p>Kepame ir planuojame kitą pardavimą. Užsukite netrukus!</p>
    </section>
  );
}

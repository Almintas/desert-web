import type { Metadata } from 'next';
import { Hero } from '@/components/hero';
import { OrderSteps } from '@/components/order-steps';
import { Storefront, UpcomingProducts } from '@/components/storefront';
import { WindowTabs } from '@/components/window-tabs';
import { SHOP_DESCRIPTION, SHOP_NAME } from '@/lib/shop';
import { getShopInfo } from '@/lib/shop-info';
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

// Antraščių tvarka visose būsenose: šūkis (h1) -> lango pavadinimas / pranešimas (h2) -> prekės (h3).
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [current, params, { pickup }] = await Promise.all([
    loadCurrentWindows(),
    searchParams,
    getShopInfo(),
  ]);

  if (!current) {
    return (
      <>
        <Hero />
        <section className="notice">
          <h2>Šiuo metu nepavyksta pasiekti parduotuvės</h2>
          <p>Pabandykite dar kartą po kelių minučių.</p>
        </section>
      </>
    );
  }

  const { upcoming, openWindows } = current;
  const open = pickOpenWindow(current, params[WINDOW_PARAM]);

  if (open) {
    return (
      <>
        <Hero />
        <WindowTabs windows={openWindows} activeId={open.id} />
        <header className="window-header">
          <p className="eyebrow">Prekyba vyksta</p>
          <h2 className="window-title">{open.title}</h2>
        </header>
        <OrderSteps saleWindow={open} pickup={pickup} />
        {open.giftWrap ? (
          <p className="order-steps-note">Desertus galima supakuoti kaip dovaną.</p>
        ) : null}
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
        <Hero />
        <header className="window-header">
          <p className="eyebrow">Netrukus</p>
          <h2 className="window-title">{upcoming.title}</h2>
          <p className="window-note">
            Kol kas galite apžiūrėti, ką ruošiame. Užsakyti bus galima prasidėjus prekybai.
          </p>
        </header>
        <OrderSteps saleWindow={upcoming} pickup={pickup} upcoming />
        <UpcomingProducts saleWindow={upcoming} />
      </>
    );
  }

  return (
    <>
      <Hero />
      <section className="notice">
        <h2>Šiuo metu užsakymų nepriimame</h2>
        <p>Kepame ir planuojame kitą pardavimą. Užsukite netrukus!</p>
      </section>
    </>
  );
}

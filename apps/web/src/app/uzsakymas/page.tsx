import { TURNSTILE_ORIGIN } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { preconnect } from 'react-dom';
import { webEnv } from '@/lib/env';
import { PRODUCT_PARAM } from '@/lib/links';
import { getShopInfo } from '@/lib/shop-info';
import { loadCurrentWindows, pickOpenWindow, WINDOW_PARAM, windowHref } from '@/lib/window';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Užsakymas',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [current, params, shopInfo] = await Promise.all([
    loadCurrentWindows(),
    searchParams,
    getShopInfo(),
  ]);

  if (!current) {
    return (
      <section className="notice">
        <h1>Šiuo metu nepavyksta pasiekti parduotuvės</h1>
        <p>Pabandykite dar kartą po kelių minučių. Jūsų krepšelis išsaugotas.</p>
      </section>
    );
  }
  const saleWindow = pickOpenWindow(current, params[WINDOW_PARAM]);
  if (!saleWindow) {
    return (
      <section className="notice">
        <h1>Šiuo metu užsakymų nepriimame</h1>
        <p>Pardavimas baigėsi arba dar neprasidėjo.</p>
        <p>
          <Link href="/" className="button secondary">
            Į parduotuvę
          </Link>
        </p>
      </section>
    );
  }

  // Ryšys su Cloudflare užmezgamas dar kraunant puslapį (api.js kraunamas iškart prijungus formą).
  preconnect(TURNSTILE_ORIGIN);

  const multiple = current.openWindows.length > 1;
  const backHref = windowHref('/', saleWindow.id, current.openWindows.length);
  // `?preke=`: tik šio lango prekė, kitaip ignoruojam ir rodom įprastą užsakymą.
  const productParam = params[PRODUCT_PARAM];
  const variantParam = Array.isArray(productParam) ? productParam[0] : productParam;
  const selectedVariantId =
    saleWindow.items.find((i) => i.variantId === variantParam)?.variantId ?? null;

  return (
    <div className="checkout-page">
      <p className="breadcrumbs">
        <Link href={backHref}>← Atgal į desertus</Link>
      </p>
      <h1>Užsakymas</h1>
      {multiple ? <p className="muted">{saleWindow.title}</p> : null}
      <CheckoutForm
        key={saleWindow.id}
        saleWindow={saleWindow}
        backHref={backHref}
        selectedVariantId={selectedVariantId}
        turnstileSiteKey={webEnv().turnstileSiteKey}
        seller={{ email: shopInfo.seller.email, phone: shopInfo.seller.phone }}
        pickup={shopInfo.pickup}
      />
    </div>
  );
}

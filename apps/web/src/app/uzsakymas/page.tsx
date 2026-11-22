import type { Metadata } from 'next';
import Link from 'next/link';
import { webEnv } from '@/lib/env';
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
  const [current, params] = await Promise.all([loadCurrentWindows(), searchParams]);

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

  const multiple = current.openWindows.length > 1;
  const backHref = windowHref('/', saleWindow.id, current.openWindows.length);

  return (
    <>
      <p className="breadcrumbs">
        <Link href={backHref}>← Atgal į prekes</Link>
      </p>
      <h1>Užsakymas</h1>
      {multiple ? <p className="muted">{saleWindow.title}</p> : null}
      <CheckoutForm
        key={saleWindow.id}
        saleWindow={saleWindow}
        backHref={backHref}
        turnstileSiteKey={webEnv().turnstileSiteKey}
      />
    </>
  );
}

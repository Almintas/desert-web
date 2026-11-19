import type { Metadata } from 'next';
import Link from 'next/link';
import { loadCurrentWindows } from '@/lib/window';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Užsakymas',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const current = await loadCurrentWindows();

  if (!current) {
    return (
      <section className="notice">
        <h1>Šiuo metu nepavyksta pasiekti parduotuvės</h1>
        <p>Pabandykite dar kartą po kelių minučių. Jūsų krepšelis išsaugotas.</p>
      </section>
    );
  }
  if (!current.open) {
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

  return (
    <>
      <p className="breadcrumbs">
        <Link href="/">← Atgal į prekes</Link>
      </p>
      <h1>Užsakymas</h1>
      <CheckoutForm saleWindow={current.open} />
    </>
  );
}

import Link from 'next/link';

export default function OrderNotFound() {
  return (
    <section className="notice">
      <h1>Užsakymas nerastas</h1>
      <p>Patikrinkite, ar nuoroda nukopijuota visa.</p>
      <p>
        <Link href="/" className="button secondary">
          Į parduotuvę
        </Link>
      </p>
    </section>
  );
}

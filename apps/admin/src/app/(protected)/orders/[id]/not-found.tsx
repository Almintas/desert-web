import Link from 'next/link';

export default function OrderNotFound() {
  return (
    <>
      <h1>Užsakymas nerastas</h1>
      <p className="muted">Tokio užsakymo nėra arba nuoroda neteisinga.</p>
      <Link href="/orders">← Atgal į užsakymus</Link>
    </>
  );
}

import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <>
      <h1>Produktas nerastas</h1>
      <p className="muted">Tokio produkto nėra arba nuoroda neteisinga.</p>
      <Link href="/products">← Atgal į produktus</Link>
    </>
  );
}

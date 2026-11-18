import Link from 'next/link';

export default function SaleWindowNotFound() {
  return (
    <>
      <h1>Langas nerastas</h1>
      <p className="muted">Tokio pardavimo lango nėra arba jis ištrintas.</p>
      <Link href="/sale-windows">← Atgal į pardavimo langus</Link>
    </>
  );
}

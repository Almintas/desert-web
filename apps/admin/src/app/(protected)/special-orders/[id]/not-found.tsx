import Link from 'next/link';

export default function SpecialOrderNotFound() {
  return (
    <>
      <h1>Užklausa nerasta</h1>
      <p className="muted">Tokios užklausos nėra arba nuoroda neteisinga.</p>
      <Link href="/special-orders">← Atgal į specialius užsakymus</Link>
    </>
  );
}

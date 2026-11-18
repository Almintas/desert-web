import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <h1>Dar nepadaryta</h1>
      <p className="muted">Šis admin puslapis bus pridėtas vėliau.</p>
      <Link href="/">← Atgal į apžvalgą</Link>
    </>
  );
}

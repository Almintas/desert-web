import { notFound } from 'next/navigation';

/** Dar nesukurti admin puslapiai rodomi su šoniniu meniu (žr. not-found.tsx šalia). */
export default function MissingPage() {
  notFound();
}

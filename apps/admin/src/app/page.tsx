import Link from 'next/link';

const SECTIONS = [
  {
    href: '/sale-windows',
    title: 'Pardavimo langai',
    text: 'Atidaryk ir uždaryk pardavimus, nustatyk kiekius ir limitus.',
  },
  { href: '/products', title: 'Produktai', text: 'Katalogas, variantai, kainos ir nuotraukos.' },
  { href: '/orders', title: 'Užsakymai', text: 'Užsakymai iš pardavimo langų ir jų būsenos.' },
  {
    href: '/special-orders',
    title: 'Specialūs užsakymai',
    text: 'Užklausos dideliems kiekiams: patvirtink su kaina arba atmesk.',
  },
];

export default function DashboardPage() {
  return (
    <>
      <h1>Apžvalga</h1>
      <p className="muted">
        Admin skeletas. Prisijungimas ir valdymo puslapiai bus pridėti kituose žingsniuose.
      </p>
      <ul className="cards">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="card">
              <h2>{s.title}</h2>
              <p className="muted">{s.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

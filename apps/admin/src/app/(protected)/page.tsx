import { type AdminDto, formatShopDate } from '@desert-web/shared';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import { CreateAdminForm } from './_admins/create-admin-form';
import { ROLE_LABELS } from './_admins/form-state';

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

export default async function DashboardPage() {
  // Layout'as navigacijos metu nebūtinai perpiešiamas, todėl tikrinam ir puslapyje.
  const admin = await requireAdmin();
  const isOwner = admin.role === 'owner';
  const admins = isOwner
    ? await apiFetch<AdminDto[]>('/admin/admins', { token: await getSessionToken() })
    : [];

  return (
    <>
      <h1>Apžvalga</h1>
      <p className="muted">Admin skeletas. Valdymo puslapiai bus pridėti kituose žingsniuose.</p>
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

      {isOwner ? (
        <section className="group admins">
          <h2>Administratoriai</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">El. paštas</th>
                  <th scope="col">Rolė</th>
                  <th scope="col">Sukurtas</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.email}
                      {a.id === admin.id ? <span className="muted"> (tu)</span> : null}
                    </td>
                    <td>{ROLE_LABELS[a.role]}</td>
                    <td>{formatShopDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CreateAdminForm />
        </section>
      ) : null}
    </>
  );
}

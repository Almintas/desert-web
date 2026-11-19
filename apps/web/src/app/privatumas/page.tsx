import type { Metadata } from 'next';
import Link from 'next/link';
import { SELLER, SHOP_NAME } from '@/lib/shop';

export const metadata: Metadata = {
  title: 'Privatumas',
  description: `Kokius duomenis renka ${SHOP_NAME} ir kam jie naudojami.`,
};

export default function PrivacyPage() {
  return (
    <article className="prose">
      <h1>Privatumas</h1>
      <p>Trumpai ir paprastai: ką sužinome apie jus, kai užsakote, ir ką su tuo darome.</p>

      <h2>Kokius duomenis renkame</h2>
      <ul>
        <li>vardą,</li>
        <li>el. pašto adresą,</li>
        <li>telefono numerį,</li>
        <li>užsakymo turinį ir jūsų pastabas, jei jas parašote.</li>
      </ul>

      <h2>Kam juos naudojame</h2>
      <p>
        Tik tam, kad paruoštume ir atiduotume jūsų užsakymą ir prireikus susisiektume dėl jo
        atsiėmimo (pvz., jei pasikeistų atsiėmimo laikas).
      </p>

      <h2>Kam juos perduodame</h2>
      <p>
        Niekam. Jūsų duomenų neparduodame ir neperduodame kitiems. Jie saugomi mūsų užsakymų
        sistemoje, kurią naudoja tik pardavėjas.
      </p>

      <h2>Slapukai ir naršyklė</h2>
      <p>
        Krepšelis laikomas tik jūsų naršyklėje (vietinėje atmintyje), kol pateiksite užsakymą.
        Reklaminių ar sekimo slapukų nenaudojame.
      </p>

      <h2>Kaip su mumis susisiekti</h2>
      <p>
        Jei norite sužinoti, kokius duomenis apie jus turime, juos pataisyti ar ištrinti, parašykite
        arba paskambinkite:
      </p>
      <p>
        {SELLER.name}
        <br />
        <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
        <br />
        <a href={`tel:${SELLER.phone.replace(/[^\d+]/g, '')}`}>{SELLER.phone}</a>
      </p>

      <p>
        <Link href="/">← Į parduotuvę</Link>
      </p>
    </article>
  );
}

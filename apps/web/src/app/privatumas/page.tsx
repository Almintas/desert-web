import type { Metadata } from 'next';
import Link from 'next/link';
import { SELLER, SHOP_NAME, sellerDisplayName, telHref } from '@desert-web/shared';

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

      <h2>El. laiškai</h2>
      <p>
        Užsakymo ir jo būsenos laiškus (pvz., kad užsakymas gautas ar paruoštas atsiimti) siunčiame
        per „Resend“, el. laiškų siuntimo paslaugų teikėją. Per jį pardavėjui siunčiamas ir
        pranešimas apie naują užsakymą su jūsų vardu, el. paštu, telefonu ir pastabomis.
      </p>
      <p>
        Jūsų el. pašto adresą naudojame tik šiems laiškams ir susisiekti dėl užsakymo.
        Naujienlaiškių ir reklamos nesiunčiame.
      </p>

      <h2>Kam juos perduodame</h2>
      <p>
        Jūsų duomenų neparduodame ir reklamai neperduodame. Jie saugomi mūsų užsakymų sistemoje,
        kurią naudoja tik pardavėjas. Laiškams išsiųsti juos tvarko „Resend“ (žr. aukščiau).
      </p>

      <h2>Slapukai ir naršyklė</h2>
      <p>
        Krepšelis laikomas tik jūsų naršyklėje (vietinėje atmintyje), kol pateiksite užsakymą.
        Reklaminių ar sekimo slapukų nenaudojame.
      </p>
      <p>
        Užsakymo formą nuo robotų saugo „Cloudflare Turnstile“: pateikiant užsakymą Cloudflare
        patikrina naršyklę ir jos IP adresą.
      </p>

      <h2>Kaip su mumis susisiekti</h2>
      <p>
        Jei norite sužinoti, kokius duomenis apie jus turime, juos pataisyti ar ištrinti, parašykite
        arba paskambinkite:
      </p>
      <p>
        {sellerDisplayName()}
        {SELLER.businessId ? (
          <>
            <br />
            {SELLER.businessId}
          </>
        ) : null}
        {SELLER.address ? (
          <>
            <br />
            {SELLER.address}
          </>
        ) : null}
        {SELLER.email ? (
          <>
            <br />
            <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
          </>
        ) : null}
        {SELLER.phone ? (
          <>
            <br />
            <a href={telHref(SELLER.phone)}>{SELLER.phone}</a>
          </>
        ) : null}
      </p>

      <p>
        <Link href="/">← Į parduotuvę</Link>
      </p>
    </article>
  );
}

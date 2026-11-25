import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  SELLER_BUSINESS_ID_LABEL,
  SHOP_NAME,
  sellerDisplayName,
  telHref,
} from '@desert-web/shared';
import { SocialLinks } from '@/components/social-links';
import { Wordmark } from '@/components/wordmark';
import { SHOP_DESCRIPTION } from '@/lib/shop';
import { getShopInfo } from '@/lib/shop-info';
import { bodyFont, displayFont, headingFont } from './fonts';
import './globals.css';

/**
 * Bazinis adresas absoliutiems OG / ikonų URL: SITE_URL (pvz., https://desertai.lt), o jo
 * nenustačius Vercel produkcijos domenas (VERCEL_PROJECT_PRODUCTION_URL, be https://).
 */
function siteUrl(): URL | undefined {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? new URL(`https://${vercel}`) : undefined;
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: SHOP_NAME, template: `%s · ${SHOP_NAME}` },
  description: SHOP_DESCRIPTION,
  applicationName: SHOP_NAME,
  // Paveikslėlį ir ikonas Next prideda pats (opengraph-image.tsx, icon.svg, apple-icon.tsx).
  openGraph: { type: 'website', siteName: SHOP_NAME, locale: 'lt_LT' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Kaip --bg: naršyklės juosta (Android, Safari) susilieja su puslapio viršumi.
  themeColor: '#fbf6f0',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Pardavėjo duomenys ir socialiniai tinklai iš admin nustatymų (API klaida: numatytieji).
  const { seller, social } = await getShopInfo();
  return (
    <html
      lang="lt"
      className={`${displayFont.variable} ${headingFont.variable} ${bodyFont.variable}`}
    >
      <body>
        <a href="#turinys" className="skip-link">
          Pereiti prie turinio
        </a>
        <header className="site-header">
          <div className="site-header-inner">
            <Wordmark href="/" />
          </div>
        </header>
        <main id="turinys" className="container">
          {children}
        </main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <p className="footer-shop">{SHOP_NAME}</p>
            {/* Kiekvienas laukas atskiroje eilutėje; neužpildyti praleidžiami. */}
            <p>
              Parduoda: {sellerDisplayName(seller)}
              {seller.businessId ? (
                <>
                  <br />
                  {SELLER_BUSINESS_ID_LABEL} {seller.businessId}
                </>
              ) : null}
              {seller.address ? (
                <>
                  <br />
                  {seller.address}
                </>
              ) : null}
              {seller.email || seller.phone ? <br /> : null}
              {seller.email ? <a href={`mailto:${seller.email}`}>{seller.email}</a> : null}
              {seller.email && seller.phone ? ' · ' : null}
              {seller.phone ? <a href={telHref(seller.phone)}>{seller.phone}</a> : null}
            </p>
            <SocialLinks links={social} />
            <p>
              <Link href="/privatumas">Privatumas</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

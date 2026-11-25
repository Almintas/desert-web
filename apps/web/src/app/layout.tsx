import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  SELLER,
  SELLER_BUSINESS_ID_LABEL,
  SHOP_NAME,
  sellerDisplayName,
  telHref,
} from '@desert-web/shared';
import { SocialLinks } from '@/components/social-links';
import { Wordmark } from '@/components/wordmark';
import { SHOP_DESCRIPTION } from '@/lib/shop';
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

export default function RootLayout({ children }: { children: ReactNode }) {
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
            {/* Kiekvienas laukas atskiroje eilutėje; neužpildyti (TODO) praleidžiami. */}
            <p>
              Parduoda: {sellerDisplayName()}
              {SELLER.businessId ? (
                <>
                  <br />
                  {SELLER_BUSINESS_ID_LABEL} {SELLER.businessId}
                </>
              ) : null}
              {SELLER.address ? (
                <>
                  <br />
                  {SELLER.address}
                </>
              ) : null}
              {SELLER.email || SELLER.phone ? <br /> : null}
              {SELLER.email ? <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a> : null}
              {SELLER.email && SELLER.phone ? ' · ' : null}
              {SELLER.phone ? <a href={telHref(SELLER.phone)}>{SELLER.phone}</a> : null}
            </p>
            <SocialLinks />
            <p>
              <Link href="/privatumas">Privatumas</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

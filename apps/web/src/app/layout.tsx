import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SELLER, SHOP_NAME } from '@desert-web/shared';
import { SHOP_DESCRIPTION } from '@/lib/shop';
import './globals.css';

export const metadata: Metadata = {
  // SITE_URL: absoliutiems OG adresams (pvz., https://desertai.lt). Neprivaloma.
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: { default: SHOP_NAME, template: `%s · ${SHOP_NAME}` },
  description: SHOP_DESCRIPTION,
  applicationName: SHOP_NAME,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fbf6f0',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="lt">
      <body>
        <a href="#turinys" className="skip-link">
          Pereiti prie turinio
        </a>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="logo">
              {SHOP_NAME}
            </Link>
          </div>
        </header>
        <main id="turinys" className="container">
          {children}
        </main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <p className="footer-shop">{SHOP_NAME}</p>
            <p>
              Pardavėja: {SELLER.name}
              <br />
              <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
              {' · '}
              <a href={`tel:${SELLER.phone.replace(/[^\d+]/g, '')}`}>{SELLER.phone}</a>
            </p>
            <p>
              <Link href="/privatumas">Privatumas</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

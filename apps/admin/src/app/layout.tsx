import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SHOP_NAME } from '@desert-web/shared';
import { wordmarkFont } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${SHOP_NAME} Admin`, template: `%s · ${SHOP_NAME} Admin` },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="lt" className={wordmarkFont.variable}>
      <body>{children}</body>
    </html>
  );
}

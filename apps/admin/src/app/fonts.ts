import { Cormorant_Garamond } from 'next/font/google';

/** Tas pats tekstinis logotipas kaip parduotuvėje (apps/web/src/app/fonts.ts). latin-ext: ą č ę… */
export const wordmarkFont = Cormorant_Garamond({
  subsets: ['latin', 'latin-ext'],
  weight: '600',
  style: 'italic',
  display: 'swap',
  variable: '--font-wordmark',
});

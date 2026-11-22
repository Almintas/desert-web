import { Bodoni_Moda } from 'next/font/google';

/**
 * Tas pats logotipo šriftas kaip parduotuvėje (apps/web/src/app/fonts.ts): kintamas, su optiniu
 * dydžiu (opsz). latin-ext: ą č ę…
 */
export const wordmarkFont = Bodoni_Moda({
  subsets: ['latin', 'latin-ext'],
  weight: 'variable',
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-wordmark',
});

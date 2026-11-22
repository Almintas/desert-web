import { Bodoni_Moda, Manrope } from 'next/font/google';

// Šriftai talpinami kartu su svetaine (next/font): jokių užklausų į Google ir be išdėstymo šuolio.
// latin-ext: ą č ę ė į š ų ū ž.

/**
 * Logotipas, h1/h2 ir prekių pavadinimai. Kintamas šriftas: storis 400–900 ir optinis dydis
 * (opsz 6–96). Naršyklė opsz parenka pagal šrifto dydį, logotipas nustato aukštą (plonos linijos).
 */
export const displayFont = Bodoni_Moda({
  subsets: ['latin', 'latin-ext'],
  weight: 'variable',
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-bodoni',
});

/** Tekstas ir sąsaja. */
export const bodyFont = Manrope({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-manrope',
});

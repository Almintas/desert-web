import { Bodoni_Moda, Fraunces, Manrope } from 'next/font/google';

// Šriftai talpinami kartu su svetaine (next/font): jokių užklausų į Google ir be išdėstymo šuolio.
// latin-ext: ą č ę ė į š ų ū ž.

/**
 * Tik logotipas (tekstinis ženklas). Kintamas šriftas: storis 400–900 ir optinis dydis
 * (opsz 6–96). Logotipas opsz nustato pats (plonos, kontrastingos linijos). Antraštėms netinka:
 * plaukinės linijos jų dydžiuose vargina akis.
 */
export const displayFont = Bodoni_Moda({
  subsets: ['latin', 'latin-ext'],
  weight: 'variable',
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-bodoni',
});

/**
 * Antraštės (h1–h3), prekių pavadinimai, parduotuvės pavadinimas poraštėje. Kintamas šriftas:
 * storis 100–900, optinis dydis (opsz 9–144, naršyklė parenka pagal šrifto dydį) ir SOFT
 * (0–100, suapvalina kampus; globals.css naudoja 50). Linijų kontrastas mažesnis nei Bodoni.
 */
export const headingFont = Fraunces({
  subsets: ['latin', 'latin-ext'],
  weight: 'variable',
  axes: ['opsz', 'SOFT'],
  display: 'swap',
  variable: '--font-fraunces',
});

/** Tekstas ir sąsaja. */
export const bodyFont = Manrope({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-manrope',
});

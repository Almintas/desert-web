import { Cormorant_Garamond, Manrope } from 'next/font/google';

// Šriftai talpinami kartu su svetaine (next/font): jokių užklausų į Google ir be išdėstymo šuolio.
// latin-ext: ą č ę ė į š ų ū ž.

/** Pavadinimas, h1/h2 ir prekių pavadinimai (tik nuo ~1.25rem: mažame dydyje per plonas). */
export const displayFont = Cormorant_Garamond({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-cormorant',
});

/** Tekstas ir sąsaja. */
export const bodyFont = Manrope({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-manrope',
});

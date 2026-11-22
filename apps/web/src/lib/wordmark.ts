import { SHOP_NAME } from '@desert-web/shared';

/**
 * Tekstinis logotipas: pavadinimas dviem eilutėmis Bodoni Moda šriftu, o pirmosios „i“
 * taškas pakeistas mažu macaron. Bendra svetainės antraštei (components/wordmark.tsx) ir
 * dalinimosi paveikslėliui (app/opengraph-image.tsx).
 */

/** Eilutės: „Vincento“ virš „Macarons“. */
export const WORDMARK_LINES = SHOP_NAME.split(/\s+/).filter(Boolean);

/**
 * Bodoni Moda storis. Optinis dydis: 96 dideliems dydžiams (OG šriftas sugeneruotas su opsz 96),
 * antraštėje žemesnis (globals.css --wordmark-opsz).
 */
export const WORDMARK_WEIGHT = 400 as const;

/**
 * Taškas be „i“ (ı) metrika em vienetais, išmatuota iš Bodoni Moda (wght 400, opsz 96):
 * ı plotis 568/2000, „i“ taško centras x 285/2000, y 1400/2000 virš bazinės linijos,
 * taško skersmuo 240/2000 (viršus 0.76em, beveik didžiųjų raidžių aukštyje 0.75em).
 */
const DOTLESS_I_ADVANCE = 0.284;
const DOT_CENTER_X = 0.1425;
const CAP_HEIGHT = 0.75;

/** Macaron dydis em (šiek tiek didesnis už tašką, kad matytųsi forma). */
export const MACARON_DOT = { width: 0.19, height: 0.15 } as const;

/** Macaron didesnis už tašką, todėl centras nuleistas: viršus sutampa su „V“ viršumi. */
const DOT_CENTER_Y = CAP_HEIGHT - MACARON_DOT.height / 2;

/**
 * Macaron vieta, kai jis eina tekste iškart po „ı“: neigiama kairė paraštė grąžina jį virš
 * raidės, dešinė paraštė grąžina žymeklį į vietą (bendras plotis lygus nuliui), o
 * vertical-align pakelia apačią virš bazinės linijos. Visa em, todėl tinka bet kokiam dydžiui
 * ir nepriklauso nuo šrifto ascent / descent metrikos.
 */
export const MACARON_DOT_OFFSET = {
  marginLeft: DOT_CENTER_X - MACARON_DOT.width / 2 - DOTLESS_I_ADVANCE,
  marginRight: DOTLESS_I_ADVANCE - DOT_CENTER_X - MACARON_DOT.width / 2,
  bottom: DOT_CENTER_Y - MACARON_DOT.height / 2,
} as const;

/** Pirmos eilutės dalys: tekstas iki „i“ (su ı) ir po jos. Be „i“ macaron nerodomas. */
export function splitAtFirstI(word: string): { before: string; after: string } | null {
  const index = word.indexOf('i');
  if (index < 0) return null;
  return { before: `${word.slice(0, index)}ı`, after: word.slice(index + 1) };
}

/** Macaron iš šono (viršutinis kevalas, įdaras, apatinis kevalas), viewBox 0 0 24 19. */
export const MACARON_VIEWBOX = '0 0 24 19';
export const MACARON_PATHS = {
  top: 'M1.5 8.6C1.5 3.9 6.2 1 12 1s10.5 2.9 10.5 7.6Z',
  filling: 'M2.6 8.6h18.8a1.4 1.4 0 0 1 0 2.8H2.6a1.4 1.4 0 0 1 0-2.8Z',
  bottom: 'M1.5 11.4h21c0 4.2-4.7 6.6-10.5 6.6S1.5 15.6 1.5 11.4Z',
} as const;

/** Spalvos: akcentinė raudona (kaip --accent) ir šviesus įdaras. */
export const MACARON_COLORS = { shell: '#a3423a', filling: '#f6e3df' } as const;

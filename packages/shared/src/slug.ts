/** Leistinas produkto slug: mažosios raidės, skaičiai ir pavieniai brūkšneliai tarp jų. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const LT_LETTERS: Record<string, string> = {
  ą: 'a',
  č: 'c',
  ę: 'e',
  ė: 'e',
  į: 'i',
  š: 's',
  ų: 'u',
  ū: 'u',
  ž: 'z',
};

/**
 * Lietuviškas pavadinimas -> slug: „Šokoladinis tortas (1 kg)“ -> "sokoladinis-tortas-1-kg".
 * Lietuviškos raidės keičiamos lotyniškomis, kitų kalbų diakritikai nuimami (é -> e),
 * visa kita, kas ne a-z / 0-9, tampa brūkšneliu. Rezultatas atitinka SLUG_PATTERN arba
 * yra tuščias (jei pavadinime nėra nė vienos raidės ar skaičiaus).
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, (ch) => LT_LETTERS[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

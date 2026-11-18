import { productInputSchema, SLUG_PATTERN, slugify } from '@desert-web/shared';

describe('slugify', () => {
  it.each([
    ['Šokoladinis tortas', 'sokoladinis-tortas'],
    ['Ąžuolų ČĘĖĮŠŲŪŽ', 'azuolu-ceeisuuz'],
    ['ąčęėįšųūž', 'aceeisuuz'],
    ['Medaus tortas (1 kg)', 'medaus-tortas-1-kg'],
    ['  --Makaronai!!  su   vyšniomis--  ', 'makaronai-su-vysniomis'],
    ['Crème brûlée', 'creme-brulee'],
    ['Pyragas_su/obuoliais & cinamonu', 'pyragas-su-obuoliais-cinamonu'],
    ['Tortas 2026', 'tortas-2026'],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('be raidžių ir skaičių grąžina tuščią eilutę', () => {
    expect(slugify('  —!?  ')).toBe('');
  });

  it('rezultatas atitinka produkto slug taisyklę', () => {
    for (const name of ['Žemuogių pyragas', 'Ūsuotas „Kęstutis“ #1', 'a', 'Ėė ėė']) {
      const slug = slugify(name);
      expect(slug).toMatch(SLUG_PATTERN);
      expect(productInputSchema.shape.slug.safeParse(slug).success).toBe(true);
    }
  });
});

import { getShopYear } from '@desert-web/shared';

describe('getShopYear (Europe/Vilnius)', () => {
  it('gruodžio 31 d. 23:30 Vilniuje dar senieji metai', () => {
    expect(getShopYear('2026-12-31T21:30:00Z')).toBe(2026);
  });

  it('sausio 1 d. 00:30 Vilniuje jau naujieji metai', () => {
    expect(getShopYear('2026-12-31T22:30:00Z')).toBe(2027);
  });

  it('priima ir Date objektą', () => {
    expect(getShopYear(new Date('2026-12-31T22:30:00Z'))).toBe(2027);
  });
});

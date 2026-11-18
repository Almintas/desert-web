import { getShopYear, utcToVilniusLocal, vilniusLocalToUtc } from '@desert-web/shared';

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

describe('vilniusLocalToUtc / utcToVilniusLocal', () => {
  const toUtc = (local: string) => vilniusLocalToUtc(local)?.toISOString() ?? null;

  it.each([
    ['2026-12-20T10:00', '2026-12-20T08:00:00.000Z'], // žiema, EET +2
    ['2026-07-01T10:00', '2026-07-01T07:00:00.000Z'], // vasara, EEST +3
    ['2026-01-01T00:00', '2025-12-31T22:00:00.000Z'], // metų riba
    ['2028-02-29T23:59', '2028-02-29T21:59:00.000Z'], // keliamieji metai
    ['2026-12-20T10:00:30', '2026-12-20T08:00:30.000Z'], // su sekundėmis
  ])('%s -> %s ir atgal', (local, utc) => {
    expect(toUtc(local)).toBe(utc);
    expect(utcToVilniusLocal(utc)).toBe(local.slice(0, 16));
  });

  describe('kovo persukimas (2026-03-29, 03:00 EET -> 04:00 EEST)', () => {
    it('prieš ir po tarpo: įprastai', () => {
      expect(toUtc('2026-03-29T02:59')).toBe('2026-03-29T00:59:00.000Z');
      expect(toUtc('2026-03-29T04:00')).toBe('2026-03-29T01:00:00.000Z');
    });

    it('neegzistuojanti valanda pastumiama pirmyn per tarpą', () => {
      expect(toUtc('2026-03-29T03:00')).toBe('2026-03-29T01:00:00.000Z');
      expect(toUtc('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z');
      expect(utcToVilniusLocal(vilniusLocalToUtc('2026-03-29T03:30')!)).toBe('2026-03-29T04:30');
    });

    it('lango trukmė per persukimą: 00:00–12:00 yra 11 valandų', () => {
      const ms =
        vilniusLocalToUtc('2026-03-29T12:00')!.getTime() -
        vilniusLocalToUtc('2026-03-29T00:00')!.getTime();
      expect(ms).toBe(11 * 3_600_000);
    });
  });

  describe('spalio persukimas (2026-10-25, 04:00 EEST -> 03:00 EET)', () => {
    it('kartojama valanda: imamas ankstesnis (vasaros laiko) momentas', () => {
      expect(toUtc('2026-10-25T03:00')).toBe('2026-10-25T00:00:00.000Z');
      expect(toUtc('2026-10-25T03:30')).toBe('2026-10-25T00:30:00.000Z');
    });

    it('abu kartojamos valandos momentai atgal rodomi tuo pačiu vietiniu laiku', () => {
      expect(utcToVilniusLocal('2026-10-25T00:30:00Z')).toBe('2026-10-25T03:30');
      expect(utcToVilniusLocal('2026-10-25T01:30:00Z')).toBe('2026-10-25T03:30');
    });

    it('prieš ir po kartojamos valandos: įprastai', () => {
      expect(toUtc('2026-10-25T02:59')).toBe('2026-10-24T23:59:00.000Z');
      expect(toUtc('2026-10-25T04:00')).toBe('2026-10-25T02:00:00.000Z');
    });

    it('lango trukmė per persukimą: 00:00–12:00 yra 13 valandų', () => {
      const ms =
        vilniusLocalToUtc('2026-10-25T12:00')!.getTime() -
        vilniusLocalToUtc('2026-10-25T00:00')!.getTime();
      expect(ms).toBe(13 * 3_600_000);
    });
  });

  it.each([
    '',
    'rytoj',
    '2026-02-30T10:00',
    '2026-13-01T10:00',
    '2026-12-20T24:00',
    '2026-12-20 10:00',
    '2026-12-20',
  ])('netinkama įvestis %j -> null', (local) => {
    expect(vilniusLocalToUtc(local)).toBeNull();
  });
});

import {
  addCalendarDays,
  formatCalendarDate,
  formatRelativeShopTime,
  isShopToday,
  getShopYear,
  isCalendarDate,
  shopToday,
  utcToVilniusLocal,
  vilniusLocalToUtc,
} from '@desert-web/shared';

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

describe('kalendorinės datos („YYYY-MM-DD“)', () => {
  it('isCalendarDate: tik egzistuojančios datos be laiko', () => {
    expect(isCalendarDate('2026-12-20')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    for (const v of [
      '2026-02-29',
      '2026-13-01',
      '2026-12-32',
      '2026-1-5',
      '2026-12-20T00:00',
      '',
    ]) {
      expect(isCalendarDate(v)).toBe(false);
    }
  });

  it.each([
    ['2026-12-31T21:59:00Z', '2026-12-31'], // 23:59 Vilniuje
    ['2026-12-31T22:00:00Z', '2027-01-01'], // 00:00 Vilniuje, UTC dar senieji metai
    ['2026-07-15T20:59:00Z', '2026-07-15'], // vasara: 23:59 EEST
    ['2026-07-15T21:00:00Z', '2026-07-16'], // 00:00 EEST
    ['2026-03-29T00:59:00Z', '2026-03-29'], // 02:59 EET, prieš persukimą
    ['2026-10-25T00:30:00Z', '2026-10-25'], // kartojama valanda (EEST)
    ['2026-10-25T01:30:00Z', '2026-10-25'], // kartojama valanda (EET)
  ])('shopToday(%s) = %s', (now, expected) => {
    expect(shopToday(new Date(now))).toBe(expected);
  });

  it('addCalendarDays: mėnesių, metų ir DST ribos nesvarbios', () => {
    expect(addCalendarDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addCalendarDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addCalendarDays('2026-10-24', 7)).toBe('2026-10-31');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addCalendarDays('2026-01-01', 365)).toBe('2027-01-01');
    expect(() => addCalendarDays('20.12.2026', 1)).toThrow();
  });

  it('formatCalendarDate: lietuviškai, be poslinkio per dieną', () => {
    expect(formatCalendarDate('2026-12-20')).toBe('gruodžio 20\u00a0d., sekmadienis');
    expect(formatCalendarDate('2026-03-29')).toBe('kovo 29\u00a0d., sekmadienis');
    expect(formatCalendarDate('2027-01-01')).toBe('sausio 1\u00a0d., penktadienis');
  });
});

describe('formatRelativeShopTime (Europe/Vilnius)', () => {
  // 2026-12-18 (penktadienis) 10:00 Vilniuje = 08:00 UTC.
  const now = '2026-12-18T08:00:00Z';

  it.each([
    ['2026-12-18T10:15:00Z', 'po 2 val. 15 min.'],
    ['2026-12-18T08:45:00Z', 'po 45 min.'],
    ['2026-12-18T11:00:00Z', 'po 3 val.'],
    ['2026-12-18T08:00:20Z', 'po 1 min.'],
    ['2026-12-18T07:20:00Z', 'prieš 40 min.'],
    ['2026-12-18T07:59:40Z', 'ką tik'],
    ['2026-12-18T20:30:00Z', 'šiandien 22:30'],
    ['2026-12-19T08:00:00Z', 'rytoj 10:00'],
    ['2026-12-17T16:00:00Z', 'vakar 18:00'],
    ['2026-12-22T08:00:00Z', 'antradienį 10:00'],
    ['2026-12-28T08:00:00Z', 'gruodžio 28\u00a0d. 10:00'],
  ])('%s -> %s', (target, expected) => {
    expect(formatRelativeShopTime(target, now)).toBe(expected);
  });

  it('„rytoj“ skaičiuojamas Vilniaus, ne UTC dienomis', () => {
    // 23:30 Vilniuje (21:30 UTC); po 13 val. jau kita Vilniaus diena.
    expect(formatRelativeShopTime('2026-12-19T10:30:00Z', '2026-12-18T21:30:00Z')).toBe(
      'rytoj 12:30',
    );
  });

  it('isShopToday pagal Vilniaus dieną', () => {
    expect(isShopToday('2026-12-18T21:59:00Z', now)).toBe(true);
    expect(isShopToday('2026-12-18T22:01:00Z', now)).toBe(false);
  });
});

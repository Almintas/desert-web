import { centsToInput, parseEurToCents } from '@desert-web/shared';

describe('centsToInput / parseEurToCents', () => {
  it.each([
    [0, '0,00'],
    [5, '0,05'],
    [1250, '12,50'],
    [100000, '1000,00'],
  ])('%i -> %j ir atgal', (cents, text) => {
    expect(centsToInput(cents)).toBe(text);
    expect(parseEurToCents(text)).toBe(cents);
  });

  it.each(['', 'abc', '12,345', '-1', '1,2,3'])('netinkama kaina %j -> null', (text) => {
    expect(parseEurToCents(text)).toBeNull();
  });

  it('priima tašką ir tarpus', () => {
    expect(parseEurToCents(' 12.5 ')).toBe(1250);
    expect(parseEurToCents('1 200,00')).toBe(120000);
  });
});

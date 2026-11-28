import { describe, expect, it } from 'vitest';
import { cartBarHref } from './links';

describe('cartBarHref', () => {
  const base = {
    windowId: 'w1',
    openCount: 1,
    itemVariantIds: ['a', 'b', 'c'],
  };
  const line = (variantId: string, quantity = 1) => ({ variantId, quantity });

  it('grąžina į paskutinę atidarytą prekę, jei ji yra lange', () => {
    expect(cartBarHref({ ...base, lastProductId: 'b', cartLines: [line('a'), line('c')] })).toBe(
      '/uzsakymas?preke=b',
    );
  });

  it('prekės nebėra lange: paskiausiai į krepšelį įdėta lango prekė', () => {
    expect(
      cartBarHref({
        ...base,
        lastProductId: 'gone',
        cartLines: [line('a'), line('c'), line('also-gone')],
      }),
    ).toBe('/uzsakymas?preke=c');
  });

  it('nieko neįsiminta: paskiausiai įdėta prekė, praleidžiant nulinius kiekius', () => {
    expect(
      cartBarHref({ ...base, lastProductId: null, cartLines: [line('b'), line('a', 0)] }),
    ).toBe('/uzsakymas?preke=b');
  });

  it('nei įsimintos, nei tinkamos krepšelio prekės: įprastas užsakymas', () => {
    expect(cartBarHref({ ...base, lastProductId: null, cartLines: [] })).toBe('/uzsakymas');
    expect(cartBarHref({ ...base, lastProductId: 'gone', cartLines: [line('gone')] })).toBe(
      '/uzsakymas',
    );
  });

  it('keli atidaryti langai: išlaiko ?langas=', () => {
    expect(cartBarHref({ ...base, openCount: 2, lastProductId: 'a', cartLines: [] })).toBe(
      '/uzsakymas?langas=w1&preke=a',
    );
    expect(cartBarHref({ ...base, openCount: 2, lastProductId: null, cartLines: [] })).toBe(
      '/uzsakymas?langas=w1',
    );
  });
});

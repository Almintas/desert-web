import { DEFAULT_SHOP_INFO, type ShopInfo, type ShopInfoDto } from '@desert-web/shared';
import { describe, expect, it, vi } from 'vitest';
import { loadShopInfo } from './shop-info';

const SAVED: ShopInfo = {
  seller: { name: 'Ona', businessId: '1', address: 'Kaunas', email: 'ona@example.com', phone: '' },
  social: { facebook: 'https://facebook.com/ona', instagram: '', tiktok: '' },
  texts: { tagline: 'Labas', subtagline: '' },
};

const SAVED_DTO: ShopInfoDto = {
  ...SAVED,
  pickup: { location: 'Vilnius, Gedimino pr. 1', hours: 'Pirm.–penkt. 17:00–20:00' },
};

const FALLBACK: ShopInfoDto = {
  ...DEFAULT_SHOP_INFO,
  pickup: { location: 'Kovo 11-osios g. 33, Kaunas', hours: '17:00–20:00' },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('loadShopInfo', () => {
  it('grąžina API reikšmes ir talpina 60 s', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(SAVED_DTO));
    expect(await loadShopInfo(fetchImpl, 'http://api.test')).toEqual(SAVED_DTO);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/shop-info',
      expect.objectContaining({ next: { revalidate: 60 } }),
    );
  });

  it.each([
    ['tinklo klaida', () => Promise.reject(new TypeError('fetch failed'))],
    ['500', () => Promise.resolve(json({ message: 'klaida' }, 500))],
    ['ne JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['netinkama forma', () => Promise.resolve(json({ seller: { name: 1 } }))],
  ])('%s: numatytosios reikšmės (ir numatytasis atsiėmimas)', async (_name, impl) => {
    expect(await loadShopInfo(vi.fn().mockImplementation(impl), 'http://api.test')).toEqual(
      FALLBACK,
    );
  });

  it.each([
    ['be pickup (senas API)', SAVED],
    ['netinkamas pickup', { ...SAVED, pickup: { location: '', hours: '17:00–20:00' } }],
  ])('%s: atsiėmimas pagal pardavėjo adresą', async (_name, body) => {
    const fetchImpl = vi.fn().mockResolvedValue(json(body));
    expect(await loadShopInfo(fetchImpl, 'http://api.test')).toEqual({
      ...SAVED,
      pickup: { location: 'Kaunas', hours: '17:00–20:00' },
    });
  });
});

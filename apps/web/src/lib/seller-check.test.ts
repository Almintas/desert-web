import type { SellerDetails } from '@desert-web/shared';
import { describe, expect, it } from 'vitest';
import { BLOCK_PRODUCTION_WITHOUT_SELLER, sellerBuildCheck } from './seller-check';

const FILLED: SellerDetails = {
  name: 'Vardenis Pavardenis',
  businessId: '123456',
  address: 'Gedimino pr. 1, Vilnius',
  email: 'info@example.lt',
  phone: '+370 600 12345',
};
const PARTIAL: SellerDetails = { ...FILLED, businessId: '', phone: '   ' };

describe('sellerBuildCheck', () => {
  it.each([undefined, 'preview', 'development'])(
    'VERCEL_ENV=%s: nieko ir su TODO laukais',
    (VERCEL_ENV) => {
      expect(sellerBuildCheck({ VERCEL_ENV }, PARTIAL, true)).toBeNull();
    },
  );

  it('VERCEL_ENV=production su visais laukais: nieko', () => {
    expect(sellerBuildCheck({ VERCEL_ENV: 'production' }, FILLED, true)).toBeNull();
  });

  it('VERCEL_ENV=production su TODO laukais, blokavimas įjungtas: klaida su laukų sąrašu', () => {
    const check = sellerBuildCheck({ VERCEL_ENV: 'production' }, PARTIAL, true);
    expect(check?.action).toBe('throw');
    expect(check?.message).toMatch(/^Production build blocked/);
    expect(check?.message).toContain('businessId');
    expect(check?.message).toContain('phone');
    expect(check?.message).not.toContain('address');
  });

  it('VERCEL_ENV=production su TODO laukais, blokavimas išjungtas: tik įspėjimas', () => {
    const check = sellerBuildCheck({ VERCEL_ENV: 'production' }, PARTIAL, false);
    expect(check?.action).toBe('warn');
    expect(check?.message).toContain('businessId');
  });

  it('numatytai (laikinai) neblokuoja', () => {
    expect(BLOCK_PRODUCTION_WITHOUT_SELLER).toBe(false);
    expect(sellerBuildCheck({ VERCEL_ENV: 'production' }, PARTIAL)?.action).toBe('warn');
  });
});

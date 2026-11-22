import type { SellerDetails } from '@desert-web/shared';
import { describe, expect, it } from 'vitest';
import { sellerBuildError } from './seller-check';

const FILLED: SellerDetails = {
  name: 'Vardenis Pavardenis',
  businessId: 'IV pažyma Nr. 123456',
  address: 'Gedimino pr. 1, Vilnius',
  email: 'info@example.lt',
  phone: '+370 600 12345',
};

describe('sellerBuildError', () => {
  it.each([undefined, 'preview', 'development'])(
    'VERCEL_ENV=%s: build veikia ir su TODO laukais',
    (VERCEL_ENV) => {
      expect(sellerBuildError({ VERCEL_ENV }, { ...FILLED, email: '', phone: '' })).toBeNull();
    },
  );

  it('VERCEL_ENV=production su visais laukais: build veikia', () => {
    expect(sellerBuildError({ VERCEL_ENV: 'production' }, FILLED)).toBeNull();
  });

  it('VERCEL_ENV=production su TODO laukais: aiški klaida su laukų sąrašu', () => {
    const message = sellerBuildError(
      { VERCEL_ENV: 'production' },
      { ...FILLED, businessId: '', phone: '   ' },
    );
    expect(message).toMatch(/Production build blocked/);
    expect(message).toContain('businessId');
    expect(message).toContain('phone');
    expect(message).not.toContain('address');
  });
});

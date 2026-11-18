import { cloudinaryImageUrl, isAllowedProductImageFile } from '@desert-web/shared';

const URL =
  'https://res.cloudinary.com/demo/image/upload/v1700000000/desert-web/test/products/a.heic';

describe('cloudinaryImageUrl', () => {
  it('įterpia f_auto,q_auto ir dydį po /upload/ (HEIC rodomas per f_auto)', () => {
    expect(cloudinaryImageUrl(URL, { width: 240, height: 240 })).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,w_240,h_240/v1700000000/desert-web/test/products/a.heic',
    );
  });

  it('be aukščio: c_limit', () => {
    expect(cloudinaryImageUrl(URL, { width: 800 })).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_800/v1700000000/desert-web/test/products/a.heic',
    );
  });

  it('nurodytas crop', () => {
    expect(cloudinaryImageUrl(URL, { width: 100.4, height: 50, crop: 'pad' })).toContain(
      '/upload/f_auto,q_auto,c_pad,w_100,h_50/v1700000000/',
    );
  });

  it('ne Cloudinary URL grąžinamas nepakeistas', () => {
    expect(cloudinaryImageUrl('https://example.com/a.jpg', { width: 10 })).toBe(
      'https://example.com/a.jpg',
    );
  });
});

describe('isAllowedProductImageFile', () => {
  it.each([
    ['tortas.jpg', 'image/jpeg', true],
    ['tortas.png', 'image/png', true],
    ['tortas.webp', 'image/webp', true],
    ['IMG_0001.HEIC', 'image/heic', true],
    ['IMG_0001.HEIC', '', true],
    ['IMG_0001.heif', 'application/octet-stream', true],
    ['animacija.gif', 'image/gif', false],
    ['dokumentas.pdf', 'application/pdf', false],
    ['apgaule.jpg', 'application/pdf', false],
    ['be-pletinio', '', false],
  ])('%s (%s): %s', (name, type, allowed) => {
    expect(isAllowedProductImageFile({ name, type })).toBe(allowed);
  });
});

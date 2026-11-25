import { describe, expect, it } from 'vitest';
import { visibleSocialLinks } from './social';

describe('visibleSocialLinks', () => {
  it('praleidžia tuščias ir vien tarpų nuorodas, išlaiko tinklų tvarką', () => {
    expect(
      visibleSocialLinks({
        tiktok: '',
        instagram: ' https://www.instagram.com/parduotuve ',
        facebook: '   ',
      }),
    ).toEqual([
      {
        network: 'instagram',
        label: 'Instagram',
        href: 'https://www.instagram.com/parduotuve',
      },
    ]);
  });

  it('rodo visas užpildytas', () => {
    expect(
      visibleSocialLinks({
        facebook: 'https://www.facebook.com/',
        instagram: 'https://www.instagram.com/',
        tiktok: 'https://www.tiktok.com/',
      }).map((link) => link.label),
    ).toEqual(['Facebook', 'Instagram', 'TikTok']);
  });

  it('visos tuščios → tuščias sąrašas (poraštėje nieko nerodom)', () => {
    expect(visibleSocialLinks({ facebook: '', instagram: '', tiktok: '' })).toEqual([]);
  });
});

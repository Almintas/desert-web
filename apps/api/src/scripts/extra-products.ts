import type { ProductInput } from '@desert-web/shared';

/**
 * Papildomi pavyzdiniai desertai. Naudoja seed.ts (vystymui) ir add-products.ts
 * (prideda prie esamos DB nieko netrindamas).
 */
export const EXTRA_PRODUCTS: (Omit<ProductInput, 'slug' | 'isActive'> & { slug: string })[] = [
  {
    name: 'Medaus tortas',
    slug: 'medaus-tortas',
    description: 'Ploni medaus biskvito sluoksniai su grietinės kremu.',
    category: 'cakes',
    allergens: ['gluten', 'eggs', 'milk'],
    variants: [
      { name: '1 kg', priceCents: 2800 },
      { name: '2 kg', priceCents: 5200 },
    ],
    specialOrder: { enabled: true, minQuantity: 3 },
  },
  {
    name: 'Šokoladinis brownie',
    slug: 'sokoladinis-brownie',
    description: 'Drėgnas juodojo šokolado pyragas su graikiniais riešutais.',
    category: 'brownies',
    allergens: ['gluten', 'eggs', 'milk', 'nuts'],
    variants: [
      { name: '1 vnt.', priceCents: 350 },
      { name: '4 vnt.', priceCents: 1300 },
    ],
    specialOrder: { enabled: true, minQuantity: 24 },
  },
  {
    name: 'Braškių sūrio pyragas',
    slug: 'braskiu-surio-pyragas',
    description: 'Kreminis sūrio pyragas ant sausainių pagrindo su braškių padažu.',
    category: 'cheesecakes',
    allergens: ['gluten', 'eggs', 'milk'],
    variants: [
      { name: '1 gabalėlis', priceCents: 550 },
      { name: 'Visas (8 gab.)', priceCents: 3600 },
    ],
    specialOrder: { enabled: false, minQuantity: 1 },
  },
  {
    name: 'Tiramisu indelis',
    slug: 'tiramisu-indelis',
    description: 'Savoiardi sausainiai, espresso ir maskarponės kremas.',
    category: 'jar-desserts',
    allergens: ['gluten', 'eggs', 'milk'],
    variants: [{ name: '200 ml', priceCents: 600 }],
    specialOrder: { enabled: true, minQuantity: 15 },
  },
  {
    name: 'Cinamono bandelės',
    slug: 'cinamono-bandeles',
    description: 'Minkštos mielinės bandelės su cinamonu ir sūrio kremo glajumi.',
    category: 'pastries',
    allergens: ['gluten', 'eggs', 'milk'],
    variants: [
      { name: '4 vnt.', priceCents: 1000 },
      { name: '9 vnt.', priceCents: 2000 },
    ],
    specialOrder: { enabled: true, minQuantity: 5 },
  },
];

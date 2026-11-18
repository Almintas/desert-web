import type { AdminProductDto } from '@desert-web/shared';

/** Unikalios esamų produktų kategorijos (pasiūlymams formoje), lietuviška abėcėle. */
export function categoriesOf(products: AdminProductDto[]): string[] {
  return [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'lt'));
}

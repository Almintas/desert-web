import type { Page } from '@playwright/test';
import {
  addToCart,
  createProduct,
  env,
  expect,
  itemLabel,
  openWindow,
  placeOrder,
  publishUpcomingWindow,
  submitButton,
  test,
  type WindowItem,
} from './support';

/**
 * Prekės kortelė veda į užsakymo puslapį (`?preke=<variantId>`): ten rodoma prekė su kiekio
 * pasirinkimu, o kontaktų laukai užrakinti, kol krepšelis tuščias.
 */
test.describe('Prekė užsakymo puslapyje', () => {
  const cardLink = (page: Page, item: WindowItem) =>
    page.getByRole('link', {
      name: `${item.productName}, ${item.variantName} – peržiūrėti ir užsakyti`,
    });
  const panel = (page: Page, item: WindowItem) =>
    page.getByRole('region', { name: item.productName });
  const nameField = (page: Page) => page.getByLabel('Vardas', { exact: true });
  const lockedNote = (page: Page) =>
    page.getByText('Pirmiausia pasirinkite kiekį – tada galėsite įvesti savo duomenis.');

  test('paspaudus kortelę atidaroma prekė, forma atrakinama pasirinkus kiekį', async ({ page }) => {
    const cake = await createProduct(
      `Braškių sūrio pyragas ${Date.now()}`,
      [{ name: 'visas (8 gab.)', priceCents: 3200 }],
      { description: 'Su šviežiomis braškėmis.\nLaikyti šaldytuve.', allergens: ['pienas'] },
    );
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    const item = w.items[0]!;

    await page.goto(env.webUrl);
    await cardLink(page, item).click();
    await expect(page).toHaveURL(new RegExp(`/uzsakymas\\?preke=${item.variantId}$`));

    const selected = panel(page, item);
    await expect(selected).toContainText('Su šviežiomis braškėmis.');
    await expect(selected).toContainText('Laikyti šaldytuve.');
    await expect(selected).toContainText('Alergenai: pienas');
    await expect(selected).toContainText('Pasirinkite kiekį');
    await expect(page.getByRole('heading', { level: 2, name: item.productName })).toBeFocused();
    await expect(page.getByText('Krepšelis tuščias.')).toBeVisible();
    await expect(nameField(page)).toBeDisabled();
    await expect(lockedNote(page)).toBeVisible();
    await expect(submitButton(page)).toBeDisabled();
    await expect(submitButton(page)).toHaveText('Užsakyti');

    await selected.getByRole('button', { name: `Didinti kiekį: ${itemLabel(item)}` }).click();
    await expect(nameField(page)).toBeEnabled();
    await expect(lockedNote(page)).toHaveCount(0);
    await expect(selected).not.toContainText('Pasirinkite kiekį');
    const lines = page.locator('.cart-line');
    await expect(lines).toHaveCount(1);
    await expect(lines.first()).toContainText(item.productName);
    await expect(page.locator('.cart-total')).toContainText('32,00');

    // Perkrovus rodoma ta pati prekė su esamu kiekiu.
    await page.reload();
    await expect(selected.getByRole('group', { name: `Kiekis: ${itemLabel(item)}` })).toContainText(
      '1',
    );
    await expect(nameField(page)).toBeEnabled();

    await page.getByRole('link', { name: '+ Pridėti kitų desertų' }).click();
    await expect(page).toHaveURL(new RegExp(`^${env.webUrl}/?$`));
    await expect(page.getByRole('region', { name: 'Krepšelis' })).toContainText('1 prekė');
  });

  test('kortelės kiekio mygtukai prideda neišeinant iš puslapio, nuotrauka atidaro prekę', async ({
    page,
  }) => {
    const cake = await createProduct(`Medaus tortas ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    const item = w.items[0]!;

    await page.goto(env.webUrl);
    await addToCart(page, item, 2);
    await expect(page).toHaveURL(new RegExp(`^${env.webUrl}/?$`));
    await expect(page.getByRole('region', { name: 'Krepšelis' })).toContainText('2 prekės');

    // Visa kortelė yra nuoroda: paspaudimas ant nuotraukos atidaro prekę.
    const card = page.getByRole('listitem').filter({ hasText: item.productName });
    await card.locator('.product-image').click({ force: true });
    await expect(page).toHaveURL(new RegExp(`/uzsakymas\\?preke=${item.variantId}$`));
    await expect(panel(page, item).getByRole('group')).toContainText('2');
    await expect(nameField(page)).toBeEnabled();
  });

  test('produktas su dviem variantais: abu rodomi, URL variantas paryškintas', async ({ page }) => {
    const pie = await createProduct(`Moliūgų pyragas ${Date.now()}`, [
      { name: '3 vnt.', priceCents: 4000 },
      { name: '6 vnt.', priceCents: 7000 },
    ]);
    const other = await createProduct(`Citrinų tortas ${Date.now()}`);
    const w = await openWindow([
      { product: pie, variant: 0 },
      { product: pie, variant: 1 },
      { product: other },
    ]);
    const small = w.items.find((i) => i.variantId === pie.variants[0]!.id)!;
    const big = w.items.find((i) => i.variantId === pie.variants[1]!.id)!;

    await page.goto(env.webUrl);
    await cardLink(page, big).click();
    const selected = panel(page, big);
    const options = selected.locator('.variant-option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('3 vnt.');
    await expect(options.nth(0)).toContainText('40,00');
    await expect(options.nth(1)).toContainText('6 vnt.');
    await expect(options.nth(1)).toContainText('70,00');
    await expect(selected.locator('.variant-option.selected')).toContainText('6 vnt.');
    await expect(selected).not.toContainText(other.name);

    await selected.getByRole('button', { name: `Didinti kiekį: ${itemLabel(small)}` }).click();
    await expect(page.locator('.cart-line')).toHaveCount(1);
    await expect(page.locator('.cart-line')).toContainText('3 vnt.');
    await expect(nameField(page)).toBeEnabled();
  });

  test('neteisinga ar kito lango prekė ignoruojama', async ({ page }) => {
    const first = await createProduct(`Pirmo lango tortas ${Date.now()}`);
    const second = await createProduct(`Antro lango tortas ${Date.now()}`);
    const w1 = await openWindow([{ product: first }]);
    const w2 = await openWindow([{ product: second }], undefined, { reset: false });

    for (const query of [
      `langas=${w1.id}&preke=nera-tokios`,
      `langas=${w1.id}&preke=${w2.items[0]!.variantId}`,
    ]) {
      await page.goto(`${env.webUrl}/uzsakymas?${query}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Užsakymas');
      await expect(page.locator('.selected-product')).toHaveCount(0);
      await expect(page.getByText('Krepšelis tuščias.')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Rinktis desertus' })).toBeVisible();
      await expect(nameField(page)).toBeDisabled();
      await expect(lockedNote(page)).toBeVisible();
    }
  });

  test('ištuštinus krepšelį forma vėl užrakinama, įvesti duomenys lieka', async ({ page }) => {
    const cake = await createProduct(`Morkų tortas ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    const item = w.items[0]!;

    await page.goto(`${env.webUrl}/uzsakymas?preke=${item.variantId}`);
    const selected = panel(page, item);
    const plus = selected.getByRole('button', { name: `Didinti kiekį: ${itemLabel(item)}` });
    await plus.click();
    await nameField(page).fill('Ona Onaitė');

    await page.getByRole('button', { name: `Pašalinti: ${itemLabel(item)}` }).click();
    await expect(nameField(page)).toBeDisabled();
    await expect(nameField(page)).toHaveValue('Ona Onaitė');
    await expect(lockedNote(page)).toBeVisible();
    await expect(submitButton(page)).toBeDisabled();
    await expect(selected).toContainText('Pasirinkite kiekį');

    await plus.click();
    await expect(nameField(page)).toBeEnabled();
    await expect(nameField(page)).toHaveValue('Ona Onaitė');
  });

  test('išparduota prekė: rodoma informacija ir „Išparduota“', async ({ page }) => {
    const cake = await createProduct(`Obuolių pyragas ${Date.now()}`, undefined, {
      description: 'Su cinamonu.',
    });
    const w = await openWindow([{ product: cake, quantity: 1 }]);
    const item = w.items[0]!;
    await placeOrder(w, [{ variantId: item.variantId, quantity: 1 }]);

    await page.goto(env.webUrl);
    await cardLink(page, item).click();
    const selected = panel(page, item);
    await expect(selected).toContainText('Su cinamonu.');
    await expect(selected.locator('.variant-sold-out')).toHaveText('Išparduota');
    await expect(selected.getByRole('group')).toHaveCount(0);
    await expect(selected).not.toContainText('Pasirinkite kiekį');
    await expect(nameField(page)).toBeDisabled();
  });

  test('būsimo lango kortelė nėra nuoroda', async ({ page }) => {
    const cake = await createProduct(`Būsimas tortas ${Date.now()}`);
    await publishUpcomingWindow([{ product: cake }]);

    await page.goto(env.webUrl);
    await expect(page.getByText(cake.name)).toBeVisible();
    await expect(page.getByRole('link', { name: /peržiūrėti ir užsakyti/ })).toHaveCount(0);
  });
});

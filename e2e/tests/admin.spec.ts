import { DEFAULT_PICKUP_INFO, formatPickupInfo, utcToVilniusLocal } from '@desert-web/shared';
import {
  adminApi,
  createProduct,
  env,
  expect,
  getWindow,
  loginAdmin,
  openWindow,
  placeOrder,
  resetWindows,
  test,
} from './support';

test.describe('Admin', () => {
  test('prisijungimas: neteisingas slaptažodis rodo klaidą, teisingas įleidžia', async ({
    page,
  }) => {
    await page.goto(`${env.adminUrl}/orders`);
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('El. paštas').fill(env.adminEmail);
    await page.getByLabel('Slaptažodis').fill('neteisingas-slaptazodis');
    await page.getByRole('button', { name: 'Prisijungti' }).click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/orders`);
    await expect(page.getByRole('heading', { name: 'Užsakymai', level: 1 })).toBeVisible();
  });

  test('produktas su nuotraukomis (Cloudinary įkėlimas perimamas)', async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/products/new`);
    const name = `Pistacijų makaronai ${Date.now()}`;
    await page.getByLabel('Pavadinimas').first().fill(name);
    await page.getByLabel('Kategorija').fill('makaronai');
    const variant = page.locator('.variant-row').first();
    await variant.getByLabel('Kiekis / svoris').fill('6 vnt.');
    await variant.getByLabel('Kaina, €').fill('9,90');
    await page.getByRole('button', { name: 'Sukurti produktą' }).click();
    await expect(page).toHaveURL(/\/products\/[a-f0-9]{24}\?created=1/);

    const images = page.locator('.product-images');
    await expect(images.getByText('0 iš 8')).toBeVisible();
    await images.locator('input[type=file]').setInputFiles([
      { name: 'pirma.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('pirma') },
      { name: 'antra.png', mimeType: 'image/png', buffer: Buffer.from('antra') },
    ]);
    await expect(images.getByText('2 iš 8')).toBeVisible();
    await expect(images.locator('.image-tile img')).toHaveCount(2);

    // Po perkrovimo nuotraukos lieka (išsaugotos API).
    await page.reload();
    await expect(page.locator('.product-images .image-tile img')).toHaveCount(2);
  });

  test('nuotraukas galima pasirinkti kuriant produktą: įkeliamos sukūrus', async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/products/new`);
    await expect(page.getByLabel(/Adresas|slug/)).toHaveCount(0);
    await page.getByLabel('Pavadinimas').fill(`Citrinų tartaletė ${Date.now()}`);
    await page.getByLabel('Kategorija').fill('tartaletės');
    const variant = page.locator('.variant-row').first();
    await variant.getByLabel('Kiekis / svoris').fill('1 vnt.');
    await variant.getByLabel('Kaina, €').fill('4,50');

    await page.locator('.product-form input[type=file]').setInputFiles([
      { name: 'pirma.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('pirma') },
      { name: 'antra.png', mimeType: 'image/png', buffer: Buffer.from('antra') },
      { name: 'netinkamas.gif', mimeType: 'image/gif', buffer: Buffer.from('gif') },
    ]);
    await expect(page.locator('.product-form .image-tile')).toHaveCount(2);
    await expect(page.getByText(/netinkamas\.gif: Netinkamas formatas/)).toBeVisible();

    await page.getByRole('button', { name: 'Sukurti produktą' }).click();
    await expect(page).toHaveURL(/\/products\/[a-f0-9]{24}\?created=1$/);
    await expect(page.getByRole('status')).toHaveText('Produktas sukurtas.');
    const images = page.locator('.product-images');
    await expect(images.getByText('2 iš 8')).toBeVisible();
    await expect(images.locator('.image-tile img')).toHaveCount(2);
  });

  test('lango skelbimas: atsiėmimo laukų lange nėra, paskelbiama iškart', async ({ page }) => {
    await resetWindows();
    const product = await createProduct(`Medaus tortas ${Date.now()}`);
    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/sale-windows/new`);

    // Atsiėmimo vieta ir laikas nustatymuose, ne lange.
    await expect(page.getByRole('group', { name: 'Atsiėmimas' })).toHaveCount(0);
    await expect(page.getByLabel(/Atsiėmimo vieta|Atsiimti nuo|Atsiimti iki/)).toHaveCount(0);

    const title = `Savaitgalio pardavimas ${Date.now()}`;
    await page.getByLabel('Pavadinimas').fill(title);
    await page.getByLabel('Atidaroma').fill(utcToVilniusLocal(new Date(Date.now() + 24 * 3600e3)));
    await page.getByLabel('Uždaroma').fill(utcToVilniusLocal(new Date(Date.now() + 48 * 3600e3)));
    await page
      .getByRole('combobox', { name: 'Produktas', exact: true })
      .selectOption({ label: product.name });
    await page.getByRole('combobox', { name: 'Variantas', exact: true }).selectOption({ index: 1 });
    await page.getByLabel('Kaina').fill('25,00');
    await page.getByLabel('Kiekis pardavimui', { exact: true }).fill('12');
    await page.getByRole('button', { name: 'Sukurti juodraštį' }).click();
    await expect(page).toHaveURL(/\/sale-windows\/[a-f0-9]{24}\?done=created/);
    await expect(page.locator('.summary')).toContainText(
      `Atsiėmimas${formatPickupInfo(DEFAULT_PICKUP_INFO)}`,
    );

    await page.getByRole('button', { name: 'Paskelbti' }).click();
    await page.getByRole('button', { name: 'Taip, paskelbti' }).click();
    await expect(page).toHaveURL(/done=publish/);
    await expect(page.locator('.badge.phase-upcoming').first()).toHaveText('Paskelbtas');
    await resetWindows();
  });

  test('atsiėmimo vieta ir laikas nustatymuose', async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/settings`);
    const form = page.locator('form#pickup');
    await expect(form.getByRole('heading', { name: 'Atsiėmimas' })).toBeVisible();
    await expect(form.getByLabel('Atsiėmimo vieta')).toHaveValue(DEFAULT_PICKUP_INFO.location);
    await expect(form.getByLabel('Atsiėmimo laikas')).toHaveValue('17:00–20:00');
    await expect(form.getByText('Pvz. 17:00–20:00 arba Pirm.–penkt. 17:00–20:00')).toBeVisible();

    try {
      await form.getByLabel('Atsiėmimo vieta').fill('');
      await form.getByRole('button', { name: 'Išsaugoti atsiėmimą' }).click();
      await expect(form.getByText('Įvesk atsiėmimo vietą')).toBeVisible();

      await form.getByLabel('Atsiėmimo vieta').fill('Gedimino pr. 1, Vilnius');
      await form.getByLabel('Atsiėmimo laikas').fill('Pirm.–penkt. 17:00–20:00');
      await form.getByRole('button', { name: 'Išsaugoti atsiėmimą' }).click();
      await expect(page).toHaveURL(/done=pickup/);
      await expect(page.getByRole('status')).toContainText('Atsiėmimo informacija išsaugota.');
      await expect(form.getByLabel('Atsiėmimo vieta')).toHaveValue('Gedimino pr. 1, Vilnius');
      await expect(form.getByLabel('Atsiėmimo laikas')).toHaveValue('Pirm.–penkt. 17:00–20:00');
    } finally {
      // Kiti testai tikisi numatytojo atsiėmimo (web jo dar nespėjo pasiimti į talpyklą).
      await adminApi('PUT', '/admin/settings', { pickup: DEFAULT_PICKUP_INFO });
    }
  });

  test('vykstančio lango redagavimas: pridedama prekė, jau esama nepasirenkama', async ({
    page,
  }) => {
    const macarons = await createProduct(`Macarons ${Date.now()}`, [
      { name: '12 vnt.', priceCents: 3000 },
    ]);
    const pie = await createProduct(`Moliūgų pyragas ${Date.now()}`, [
      { name: '3 vnt.', priceCents: 4000 },
      { name: '6 vnt.', priceCents: 7000 },
    ]);
    const w = await openWindow([{ product: macarons, quantity: 4 }]);
    await placeOrder(w, [{ variantId: macarons.variants[0]!.id, quantity: 1 }]);

    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/sale-windows/${w.id}/edit`);
    // Lentelė: aiškūs stulpeliai be limitų, paaiškinimas ir parduotas kiekis prie esamos prekės.
    await expect(page.locator('.items-table thead th')).toHaveText([
      'Prekė',
      'Kaina, €',
      'Kiekis pardavimui',
      'Išimti',
    ]);
    await expect(page.getByText(/^Kiekis pardavimui – kiek pasirinktų pakuočių/)).toBeVisible();
    await expect(page.locator('.items-table tbody tr').first()).toContainText('Parduota: 1');
    await page.getByRole('button', { name: /Pridėti prekę/ }).click();
    const product = page.getByRole('combobox', { name: 'Produktas', exact: true });
    const variant = page.getByRole('combobox', { name: 'Variantas', exact: true });

    // Produktas, kurio visi variantai jau lange, nepasirenkamas.
    await expect(
      product.getByRole('option', { name: `${macarons.name} (jau lange)` }),
    ).toBeDisabled();

    // Nepasirinkus varianto rodoma klaida; pasirinkus ji dingsta dar prieš išsaugant.
    await product.selectOption({ label: pie.name });
    await page.getByLabel('Kaina').nth(1).fill('40,00');
    await page.getByLabel('Kiekis pardavimui', { exact: true }).nth(1).fill('5');
    await page.getByRole('button', { name: 'Išsaugoti' }).click();
    const rowError = page.locator('.item-cell .field-error');
    await expect(rowError).toHaveText('Pasirink produktą ir variantą');
    await variant.selectOption({ label: '3 vnt.' });
    await expect(rowError).toHaveCount(0);

    await page.getByRole('button', { name: 'Išsaugoti' }).click();
    await expect(page).toHaveURL(/done=saved/);
    const saved = await getWindow(w.id);
    expect(saved.items.map((i) => i.variantName)).toEqual(['12 vnt.', '3 vnt.']);
    await resetWindows();
  });
});

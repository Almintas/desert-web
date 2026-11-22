import { formatEur } from '@desert-web/shared';
import {
  addToCart,
  adminApi,
  createDraftWindow,
  createProduct,
  env,
  expect,
  fillCheckout,
  getWindow,
  itemLabel,
  loginAdmin,
  openWindow,
  resetWindows,
  submitButton,
  test,
} from './support';

/** Ekrane rodoma suma (lt-LT su NBSP prieš €), kaip ją randa getByText / toContainText. */
const eur = (cents: number) => formatEur(cents);

test.describe('Dovanų pakavimas', () => {
  test('adminas įjungia pakavimą su kaina ir pažymi, kurias prekes galima pakuoti', async ({
    page,
  }) => {
    await resetWindows();
    const cake = await createProduct(`Dovanų tortas ${Date.now()}`);
    const cookies = await createProduct(`Sausainiai ${Date.now()}`, [
      { name: '12 vnt.', priceCents: 900 },
    ]);
    const draft = await createDraftWindow([{ product: cake }, { product: cookies }]);

    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/sale-windows/${draft.id}/edit`);
    const section = page.getByRole('group', { name: 'Dovanų pakavimas' });
    const toggle = section.getByLabel('Leisti supakuoti kaip dovaną');
    await expect(toggle).not.toBeChecked();
    // Išjungus kaina ir prekių stulpelis nerodomi.
    await expect(section.getByLabel('Kaina už vienetą, €')).toHaveCount(0);
    await expect(page.getByLabel('Galima supakuoti kaip dovaną')).toHaveCount(0);

    await toggle.check();
    // Be kainos: klaida prie lauko.
    await page.getByRole('button', { name: 'Išsaugoti' }).click();
    await expect(section.getByText('Įvesk kainą')).toBeVisible();

    await section.getByLabel('Kaina už vienetą, €').fill('2,50');
    await expect(section.getByText(/Pirkėjas mokės 2,50\s€/)).toBeVisible();
    const perItem = page.getByLabel('Galima supakuoti kaip dovaną');
    await expect(perItem).toHaveCount(2);
    await expect(perItem.nth(0)).toBeChecked();
    await perItem.nth(1).uncheck();
    await page.getByRole('button', { name: 'Išsaugoti' }).click();

    await expect(page).toHaveURL(/done=saved/);
    await expect(page.locator('.summary')).toContainText('Dovanų pakavimas');
    await expect(page.locator('.summary')).toContainText(`${eur(250)} / vnt.`);
    await expect(page.locator('.summary')).toContainText('ne visoms prekėms (1 iš 2)');

    const saved = await getWindow(draft.id);
    expect(saved.giftWrap).toEqual({ enabled: true, priceCents: 250 });
    expect(saved.items.map((i) => (i as { giftWrapAllowed?: boolean }).giftWrapAllowed)).toEqual([
      true,
      false,
    ]);

    // Redaguojant vėl: kaina rodoma lt-LT formatu.
    await page.goto(`${env.adminUrl}/sale-windows/${draft.id}/edit`);
    await expect(section.getByLabel('Kaina už vienetą, €')).toHaveValue('2,50');
  });

  test('pirkėjas supakuoja 2 iš 3: sumos, patvirtinimas ir admino užsakymas', async ({ page }) => {
    const cake = await createProduct(`Kalėdinis tortas ${Date.now()}`, [
      { name: '1 kg', priceCents: 2000 },
    ]);
    const w = await openWindow([{ product: cake, quantity: 10 }], undefined, {
      giftWrap: { enabled: true, priceCents: 200 },
    });
    const item = w.items[0]!;
    const label = itemLabel(item);

    await page.goto(env.webUrl);
    await expect(page.getByText('Desertus galima supakuoti kaip dovaną.')).toBeVisible();
    await addToCart(page, item, 3);
    await page.getByRole('link', { name: 'Užsakyti', exact: true }).click();
    await expect(page).toHaveURL(/\/uzsakymas$/);

    const line = page.locator('.cart-line').filter({ hasText: item.productName });
    const checkbox = line.getByRole('checkbox', { name: /Supakuoti kaip dovaną/ });
    await expect(line).toContainText(`(+${eur(200)} už vnt.)`);
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator('.cart-subtotals')).toHaveCount(0);

    // Pažymėjus supakuojami visi trys.
    await checkbox.check();
    const count = line.getByRole('group', { name: `Kiek supakuoti kaip dovaną: ${label}` });
    await expect(count).toContainText('3 iš 3');
    await expect(page.locator('.cart-subtotals')).toContainText('Dovanų pakavimas (3 vnt.)');

    await count.getByRole('button', { name: `Supakuoti mažiau: ${label}` }).click();
    await expect(count).toContainText('2 iš 3');
    const subtotals = page.locator('.cart-subtotals');
    await expect(subtotals).toContainText('Prekės');
    await expect(subtotals).toContainText(eur(6000));
    await expect(subtotals).toContainText('Dovanų pakavimas (2 vnt.)');
    await expect(subtotals).toContainText(eur(400));
    await expect(page.locator('.cart-total')).toContainText(eur(6400));

    // Išlieka perkrovus (kaip ir kiekiai).
    await page.reload();
    await expect(count).toContainText('2 iš 3');

    // Sumažinus kiekį iki 1, pakavimas apribojamas, o skaičiuoklė dingsta.
    await line.getByRole('button', { name: `Mažinti kiekį: ${label}` }).click();
    await line.getByRole('button', { name: `Mažinti kiekį: ${label}` }).click();
    await expect(checkbox).toBeChecked();
    await expect(count).toHaveCount(0);
    await expect(page.locator('.cart-subtotals')).toContainText('Dovanų pakavimas (1 vnt.)');
    // Atgal iki 3: pakuojamas lieka 1, padidinam iki 2.
    await line.getByRole('button', { name: `Didinti kiekį: ${label}` }).click();
    await line.getByRole('button', { name: `Didinti kiekį: ${label}` }).click();
    await expect(count).toContainText('1 iš 3');
    await count.getByRole('button', { name: `Supakuoti daugiau: ${label}` }).click();
    await expect(count).toContainText('2 iš 3');

    await fillCheckout(page);
    await expect(submitButton(page)).toBeEnabled();
    await expect(submitButton(page)).toHaveText(/64,00/);
    await submitButton(page).click();

    await expect(page).toHaveURL(/\/uzsakymas\/[A-Za-z0-9_-]{32}$/);
    const orderLines = page.locator('.order-lines');
    await expect(orderLines).toContainText(`Supakuoti kaip dovaną: 2 vnt. × ${eur(200)}`);
    await expect(page.locator('.cart-subtotals')).toContainText('Dovanų pakavimas (2 vnt.)');
    await expect(page.locator('.cart-total')).toContainText(eur(6400));
    const orderNumber = (await page.getByRole('heading', { level: 1 }).textContent())!
      .replace('Užsakymas', '')
      .trim();

    // Admino sąraše ženklelis „Dovana“, detalėje eilutė ir sumų išskaidymas.
    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/orders?q=${encodeURIComponent(orderNumber)}`);
    const row = page.getByRole('row').filter({ hasText: orderNumber });
    await expect(row.locator('.badge.gift')).toHaveText('Dovana');
    await row.getByRole('link', { name: orderNumber }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Užsakymas ${orderNumber}`);
    await expect(page.getByText(`Supakuoti kaip dovaną: 2 vnt. × ${eur(200)}`)).toBeVisible();
    const foot = page.locator('tfoot');
    await expect(foot).toContainText('Prekės');
    await expect(foot).toContainText(eur(6000));
    await expect(foot).toContainText('Dovanų pakavimas (2 vnt.)');
    await expect(foot).toContainText(eur(400));
    await expect(foot).toContainText(eur(6400));
  });

  test('lange pakavimas išjungtas: varnelės ir užuominų nėra', async ({ page }) => {
    const cake = await createProduct(`Paprastas tortas ${Date.now()}`);
    const w = await openWindow([{ product: cake }], undefined, {
      giftWrap: { enabled: false, priceCents: 200 },
    });
    const item = w.items[0]!;

    await page.goto(env.webUrl);
    await expect(page.getByText('Desertus galima supakuoti kaip dovaną.')).toHaveCount(0);
    await addToCart(page, item, 2);
    await page.getByRole('link', { name: 'Užsakyti', exact: true }).click();
    await expect(page.locator('.cart-line')).toHaveCount(1);
    await expect(page.getByRole('checkbox', { name: /Supakuoti kaip dovaną/ })).toHaveCount(0);
  });

  test('prekė pakavimo neleidžia: jos eilutėje varnelės nėra', async ({ page }) => {
    const cake = await createProduct(`Pakuojamas tortas ${Date.now()}`);
    const cookies = await createProduct(`Nepakuojami sausainiai ${Date.now()}`, [
      { name: '12 vnt.', priceCents: 900 },
    ]);
    const w = await openWindow(
      [{ product: cake }, { product: cookies, giftWrapAllowed: false }],
      undefined,
      { giftWrap: { enabled: true, priceCents: 150 } },
    );
    const [cakeItem, cookieItem] = w.items;

    // Pasirinktos prekės skydelyje: tik užuomina, be pasirinkimo.
    await page.goto(`${env.webUrl}/uzsakymas?preke=${cakeItem!.variantId}`);
    const panel = page.locator('.selected-product');
    await expect(panel.getByText('Galima supakuoti kaip dovaną')).toBeVisible();
    await expect(panel.getByRole('checkbox')).toHaveCount(0);
    await page.goto(`${env.webUrl}/uzsakymas?preke=${cookieItem!.variantId}`);
    await expect(
      page.locator('.selected-product').getByText('Galima supakuoti kaip dovaną'),
    ).toHaveCount(0);

    await page.goto(env.webUrl);
    await addToCart(page, cakeItem!, 1);
    await addToCart(page, cookieItem!, 1);
    await page.getByRole('link', { name: 'Užsakyti', exact: true }).click();
    const cakeLine = page.locator('.cart-line').filter({ hasText: cakeItem!.productName });
    const cookieLine = page.locator('.cart-line').filter({ hasText: cookieItem!.productName });
    await expect(cakeLine.getByRole('checkbox', { name: /Supakuoti kaip dovaną/ })).toBeVisible();
    await expect(cookieLine.getByRole('checkbox')).toHaveCount(0);
    // Vienas vienetas: tik varnelė, be skaičiuoklės.
    await cakeLine.getByRole('checkbox', { name: /Supakuoti kaip dovaną/ }).check();
    await expect(cakeLine.getByRole('group', { name: /Kiek supakuoti/ })).toHaveCount(0);
    await expect(page.locator('.cart-subtotals')).toContainText('Dovanų pakavimas (1 vnt.)');
  });

  test('adminas išjungė pakavimą, kol pirkėjas pildė formą: krepšelis pataisomas', async ({
    page,
  }) => {
    const cake = await createProduct(`Netikėtas tortas ${Date.now()}`, [
      { name: '1 kg', priceCents: 2000 },
    ]);
    const w = await openWindow([{ product: cake }], undefined, {
      giftWrap: { enabled: true, priceCents: 200 },
    });
    const item = w.items[0]!;

    await page.goto(env.webUrl);
    await addToCart(page, item, 2);
    await page.getByRole('link', { name: 'Užsakyti', exact: true }).click();
    const line = page.locator('.cart-line').filter({ hasText: item.productName });
    await line.getByRole('checkbox', { name: /Supakuoti kaip dovaną/ }).check();
    await fillCheckout(page);
    await expect(submitButton(page)).toHaveText(/44,00/);

    // Adminas tuo metu išjungia pakavimą (puslapis dar rodo seną lango vaizdą).
    const current = await adminApi('GET', `/admin/sale-windows/${w.id}`);
    await adminApi('PUT', `/admin/sale-windows/${w.id}`, {
      title: current.title,
      opensAt: current.opensAt,
      closesAt: current.closesAt,
      fulfillment: {
        pickupAvailable: current.fulfillment.pickupAvailable,
        pickupLocation: current.fulfillment.pickupLocation,
        pickupFrom: current.fulfillment.pickupFrom,
        pickupTo: current.fulfillment.pickupTo,
        deliveryAvailable: current.fulfillment.deliveryAvailable,
      },
      giftWrap: { enabled: false, priceCents: 200 },
      items: current.items.map((i: Record<string, unknown>) => ({
        productId: i.productId,
        variantId: i.variantId,
        priceCents: i.priceCents,
        quantityTotal: i.quantityTotal,
      })),
    });

    await submitButton(page).click();
    const changes = page.getByRole('status').filter({ hasText: 'Krepšelis pakeistas' });
    await expect(changes).toContainText(
      `${itemLabel(item)}: supakuoti kaip dovaną nebegalima, pakavimas pašalintas`,
    );
    await expect(page.getByRole('checkbox', { name: /Supakuoti kaip dovaną/ })).toHaveCount(0);
    await expect(page.locator('.cart-subtotals')).toHaveCount(0);
    // Kiekis nepakeistas; pateikus dar kartą užsakymas priimamas be pakavimo.
    await expect(line.getByRole('group', { name: `Kiekis: ${itemLabel(item)}` })).toContainText(
      '2',
    );
    await expect(submitButton(page)).toBeEnabled();
    await expect(submitButton(page)).toHaveText(/40,00/);
    await submitButton(page).click();
    await expect(page).toHaveURL(/\/uzsakymas\/[A-Za-z0-9_-]{32}$/);
    await expect(page.locator('.order-lines')).not.toContainText('Supakuoti kaip dovaną');
  });
});

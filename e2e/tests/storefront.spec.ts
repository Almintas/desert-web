import { DEFAULT_PICKUP_INFO, formatPickupInfo } from '@desert-web/shared';
import {
  addToCart,
  adminApi,
  createProduct,
  customer,
  env,
  expect,
  fillCheckout,
  findOrders,
  getWindow,
  itemLabel,
  loginAdmin,
  openWindow,
  placeOrder,
  submitButton,
  test,
} from './support';

const SHOP_TAGLINE = 'Tokių macarons niekur kitur nerasite.';
/** Atsiėmimas nustatymuose neišsaugotas: „Kovo 11-osios g. 33, Kaunas, 17:00–20:00“. */
const PICKUP_TEXT = formatPickupInfo(DEFAULT_PICKUP_INFO);

test.describe('Parduotuvė ir užsakymas', () => {
  test('krepšelis išlieka perkrovus puslapį', async ({ page }) => {
    const cake = await createProduct(`Medaus tortas ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    const item = w.items[0]!;

    await page.goto(env.webUrl);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SHOP_TAGLINE);
    await expect(page.getByRole('heading', { name: w.title, level: 2 })).toBeVisible();
    // Žingsniai su lango duomenimis ir atsiėmimu iš nustatymų vietoj atskiro bloko.
    const steps = page.getByRole('list', { name: 'Kaip užsakyti' });
    await expect(steps).toContainText(`Atsiėmimas: ${PICKUP_TEXT}`);
    await expect(steps).toContainText('Užsakykite iki');
    await addToCart(page, item, 3);
    const cartBar = page.getByRole('region', { name: 'Krepšelis' });
    await expect(cartBar).toContainText('3 prekės');

    await page.reload();
    await expect(cartBar).toContainText('3 prekės');
    await expect(page.getByRole('group', { name: `Kiekis: ${itemLabel(item)}` })).toContainText(
      '3',
    );
  });

  test('aprašymas kortelėje, alergenai pasirinkus prekę ir krepšelyje', async ({ page }) => {
    const tart = await createProduct(
      `Migdolų macarons ${Date.now()}`,
      [{ name: '6 vnt.', priceCents: 1200 }],
      {
        description: 'Su migdolų kremu ir aviečių džemu.',
        allergens: ['kiaušiniai', 'migdolai', 'pienas'],
      },
    );
    const plain = await createProduct(`Be alergenų ${Date.now()}`);
    const w = await openWindow([{ product: tart }, { product: plain }]);
    const [tartItem, plainItem] = w.items;

    await page.goto(env.webUrl);
    const card = page.getByRole('listitem').filter({ hasText: tartItem!.productName });
    await expect(card).toContainText('Su migdolų kremu ir aviečių džemu.');
    const reveal = card.locator('.allergen-reveal');
    await expect(reveal).toHaveAttribute('data-shown', 'false');
    await expect(reveal).toHaveText('Alergenai: kiaušiniai, migdolai, pienas');

    await addToCart(page, tartItem!, 1);
    await expect(reveal).toHaveAttribute('data-shown', 'true');
    await expect(reveal.locator('.allergens')).toHaveCSS('opacity', '1');

    await addToCart(page, plainItem!, 1);
    const plainCard = page.getByRole('listitem').filter({ hasText: plainItem!.productName });
    await expect(plainCard.locator('.allergens')).toHaveCount(0);

    await page.getByRole('link', { name: 'Užsakyti', exact: true }).click();
    const lines = page.locator('.cart-line');
    await expect(lines.filter({ hasText: tartItem!.productName })).toContainText(
      'Alergenai: kiaušiniai, migdolai, pienas',
    );
    await expect(
      lines.filter({ hasText: plainItem!.productName }).locator('.allergens'),
    ).toHaveCount(0);
    await expect(page.getByText('Jei turite alergijų ar klausimų dėl sudėties')).toBeVisible();
  });

  test('užsakymas ir patvirtinimo puslapis', async ({ page }) => {
    const cake = await createProduct(`Šokoladinis tortas ${Date.now()}`, [
      { name: '1 kg', priceCents: 2500 },
    ]);
    const w = await openWindow([{ product: cake, quantity: 10, priceCents: 2200 }]);
    const item = w.items[0]!;

    await page.goto(env.webUrl);
    await addToCart(page, item, 2);
    await page.getByRole('link', { name: 'Užsakyti', exact: true }).click();
    await expect(page).toHaveURL(/\/uzsakymas$/);
    const who = await fillCheckout(page);
    await expect(submitButton(page)).toBeEnabled();
    await expect(submitButton(page)).toHaveText(/44,00/);
    // Tas pats apmokėjimo tekstas formoje ir patvirtinimo puslapyje (PAYMENT_TEXT).
    await expect(page.getByText('Apmokėjimas atsiimant.', { exact: true })).toBeVisible();
    await expect(page.locator('.checkout-facts')).toContainText(`Atsiėmimas: ${PICKUP_TEXT}`);
    await submitButton(page).click();

    await expect(page).toHaveURL(/\/uzsakymas\/[A-Za-z0-9_-]{32}$/);
    await expect(page.getByText('Ačiū! Užsakymą gavome')).toBeVisible();
    await expect(page.getByText('Neapmokėta Apmokėjimas atsiimant.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Užsakymas DW-\d{4}-\d{4}/);
    await expect(page.getByText(PICKUP_TEXT, { exact: true })).toBeVisible();
    await expect(page.getByText(itemLabel(item).split(' ')[0]!).first()).toBeVisible();

    expect(await findOrders(who.email)).toHaveLength(1);
    expect((await getWindow(w.id)).items[0]!.quantityAvailable).toBe(8);

    // Krepšelis po užsakymo tuščias.
    await page.goto(env.webUrl);
    await expect(page.getByRole('region', { name: 'Krepšelis' })).toHaveCount(0);
  });

  test('kiekių lenktynės: kitas pirkėjas nupirko, krepšelis pataisomas', async ({ page }) => {
    const cake = await createProduct(`Citrinų tortas ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 5 }]);
    const item = w.items[0]!;

    await page.goto(env.webUrl);
    await addToCart(page, item, 4);
    await page.goto(`${env.webUrl}/uzsakymas`);
    const who = await fillCheckout(page);

    // Kol pirkėjas pildė formą, kitas nupirko 3 (liko 2).
    await placeOrder(w, [{ variantId: item.variantId, quantity: 3 }]);

    await submitButton(page).click();
    const changes = page.getByRole('status').filter({ hasText: 'Krepšelis pakeistas' });
    await expect(changes).toContainText('liko tik 2');
    await expect(page.getByRole('group', { name: `Kiekis: ${itemLabel(item)}` })).toContainText(
      '2',
    );
    expect(await findOrders(who.email)).toHaveLength(0);

    // Naujas bandymas (su nauju Turnstile tokenu) praeina.
    await expect(submitButton(page)).toBeEnabled();
    await submitButton(page).click();
    await expect(page).toHaveURL(/\/uzsakymas\/[A-Za-z0-9_-]{32}$/);
    expect(await findOrders(who.email)).toHaveLength(1);
    expect((await getWindow(w.id)).items[0]!.quantityAvailable).toBe(0);
  });

  test('dvigubas paspaudimas sukuria vieną užsakymą', async ({ page }) => {
    const cake = await createProduct(`Morkų tortas ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    const item = w.items[0]!;

    await page.goto(env.webUrl);
    await addToCart(page, item, 1);
    await page.goto(`${env.webUrl}/uzsakymas`);
    const who = await fillCheckout(page);
    await expect(submitButton(page)).toBeEnabled();
    await submitButton(page).dblclick();

    await expect(page).toHaveURL(/\/uzsakymas\/[A-Za-z0-9_-]{32}$/);
    expect(await findOrders(who.email)).toHaveLength(1);
    expect((await getWindow(w.id)).items[0]!.quantityAvailable).toBe(9);
  });

  test('uždarius langą užsakyti nebegalima', async ({ page }) => {
    const cake = await createProduct(`Obuolių pyragas ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    const item = w.items[0]!;

    await page.goto(env.webUrl);
    await addToCart(page, item, 1);
    await page.goto(`${env.webUrl}/uzsakymas`);
    const who = await fillCheckout(page);

    // Adminas uždaro langą per admin UI.
    const admin = await page.context().newPage();
    await loginAdmin(admin);
    await admin.goto(`${env.adminUrl}/sale-windows/${w.id}`);
    await admin.getByRole('button', { name: 'Uždaryti dabar' }).click();
    await admin.getByRole('button', { name: 'Taip, uždaryti' }).click();
    await expect(admin).toHaveURL(/done=close-now/);
    await expect(admin.locator('.badge.phase-closed').first()).toBeVisible();
    await admin.close();

    await submitButton(page).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'Pardavimas ką tik baigėsi',
    );
    expect(await findOrders(who.email)).toHaveLength(0);

    await page.goto(env.webUrl);
    await expect(page.getByText('Prekyba vyksta')).toHaveCount(0);
    await page.goto(`${env.webUrl}/uzsakymas`);
    await expect(
      page.getByRole('heading', { name: 'Šiuo metu užsakymų nepriimame' }),
    ).toBeVisible();
  });
});

test.describe('Užsakymai admin panelėje', () => {
  test('užsakymas matomas, būsenos keičiamos iki įvykdyto, apmokėjimas pažymimas', async ({
    page,
  }) => {
    const cake = await createProduct(`Varškės tortas ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    const who = customer();
    const { order, accessToken } = await placeOrder(
      w,
      [{ variantId: w.items[0]!.variantId, quantity: 2 }],
      who,
    );

    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/orders`);
    await page.getByRole('link', { name: order.orderNumber }).click();
    await expect(
      page.getByRole('heading', { name: `Užsakymas ${order.orderNumber}` }),
    ).toBeVisible();
    await expect(page.getByText(who.name)).toBeVisible();
    await expect(page.getByText('Neapmokėtas')).toBeVisible();

    const steps: [string, string][] = [
      ['Patvirtinti', 'Taip, patvirtinti'],
      ['Pažymėti paruoštu', 'Taip, pažymėti paruoštu'],
      ['Pažymėti įvykdytu', 'Taip, pažymėti įvykdytu'],
    ];
    for (const [button, confirm] of steps) {
      await page.getByRole('button', { name: button, exact: true }).click();
      await page.getByRole('button', { name: confirm }).click();
      await expect(page).toHaveURL(/done=/);
    }
    await expect(page.getByText('Apmokėtas', { exact: true })).toBeVisible();
    // Istorijoje rodomas pakeitusio admino el. paštas.
    await expect(page.locator('.history')).toContainText(`pakeitė ${env.adminEmail}`);
    await expect(page.locator('.history')).toContainText('pateikė pirkėjas');

    const fresh = await adminApi<{ status: string; payment: { status: string } }>(
      'GET',
      `/admin/orders/${order.id}`,
    );
    expect([fresh.status, fresh.payment.status]).toEqual(['completed', 'paid']);

    // Pirkėjo puslapyje būsena atnaujinta.
    await page.goto(`${env.webUrl}/uzsakymas/${accessToken}`);
    await expect(page.getByText('Atsiimtas')).toBeVisible();
  });

  test('atšaukus užsakymą kiekiai grąžinami į langą', async ({ page }) => {
    const cake = await createProduct(`Aguonų vyniotinis ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    const { order, accessToken } = await placeOrder(w, [
      { variantId: w.items[0]!.variantId, quantity: 4 },
    ]);
    expect((await getWindow(w.id)).items[0]!.quantityAvailable).toBe(6);

    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/orders/${order.id}`);
    await page.getByRole('button', { name: 'Atšaukti užsakymą' }).click();
    await page.getByLabel('Priežastis (neprivaloma)').fill('Pirkėjas paprašė');
    await page.getByRole('button', { name: 'Taip, atšaukti užsakymą' }).click();
    await expect(page).toHaveURL(/done=cancel/);
    await expect(page.locator('.badge').filter({ hasText: 'Atšauktas' }).first()).toBeVisible();

    expect((await getWindow(w.id)).items[0]!.quantityAvailable).toBe(10);
    await page.goto(`${env.webUrl}/uzsakymas/${accessToken}`);
    await expect(page.getByText('Šis užsakymas atšauktas.')).toBeVisible();
  });

  test('lango su užsakymu atšaukti negalima: klaida su nuoroda į užsakymus', async ({ page }) => {
    const cake = await createProduct(`Napoleonas ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    await placeOrder(w, [{ variantId: w.items[0]!.variantId, quantity: 1 }]);

    await loginAdmin(page);
    await page.goto(`${env.adminUrl}/sale-windows/${w.id}`);
    await page.getByRole('button', { name: 'Atšaukti langą' }).click();
    await page.getByRole('button', { name: 'Taip, atšaukti langą' }).click();
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toBeVisible();
    await alert.getByRole('link', { name: 'Peržiūrėti lango užsakymus →' }).click();
    await expect(page).toHaveURL(new RegExp(`/orders\\?window=${w.id}`));
    expect((await getWindow(w.id)).phase).toBe('open');
  });
});

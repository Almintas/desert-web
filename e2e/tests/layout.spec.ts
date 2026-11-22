import {
  addToCart,
  adminApi,
  createProduct,
  env,
  expect,
  expectNoHorizontalScroll,
  loginAdmin,
  openWindow,
  placeOrder,
  test,
} from './support';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** Ilgi pavadinimai ir el. paštai: dažniausia horizontalaus slinkimo priežastis. */
const LONG = 'Labai-ilgas-pavadinimas-be-tarpų-kuris-netelpa-ekrane';

test('nėra horizontalaus slinkimo 390 px pločio ekrane (visi puslapiai)', async ({ page }) => {
  test.setTimeout(120_000);
  const cake = await createProduct(`${LONG} tortas`, [
    { name: 'Didelis variantas su ilgu pavadinimu 2 kg', priceCents: 123456 },
  ]);
  const w = await openWindow([{ product: cake, quantity: 5 }], `${LONG} pardavimas`);
  const { order, accessToken } = await placeOrder(
    w,
    [{ variantId: w.items[0]!.variantId, quantity: 1 }],
    {
      name: `Vardenis ${LONG}`,
      email: `labai.ilgas.el.pasto.adresas.${Date.now()}@pavyzdys-su-ilgu-domenu.example.com`,
      phone: '+37061234567',
    },
  );
  const product = await adminApi<{ id: string }>('GET', `/admin/products/${cake.id}`);

  // Web
  await page.goto(env.webUrl);
  await expectNoHorizontalScroll(page);
  await addToCart(page, w.items[0]!, 1);
  await expectNoHorizontalScroll(page);
  for (const path of ['/uzsakymas', `/uzsakymas/${accessToken}`, '/privatumas', '/nera-tokio']) {
    await page.goto(`${env.webUrl}${path}`);
    await expectNoHorizontalScroll(page);
  }

  // Admin
  await page.goto(`${env.adminUrl}/login`);
  await expectNoHorizontalScroll(page);
  await loginAdmin(page);
  for (const path of [
    '/',
    '/products',
    '/products/new',
    `/products/${product.id}`,
    '/sale-windows',
    '/sale-windows/new',
    `/sale-windows/${w.id}`,
    `/sale-windows/${w.id}/edit`,
    '/orders',
    `/orders?window=${w.id}`,
    `/orders/${order.id}`,
  ]) {
    await page.goto(`${env.adminUrl}${path}`);
    await expectNoHorizontalScroll(page);
  }
});

test.describe('pagrindinis puslapis telefone (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('vienas langas: be skirtukų, pirmos prekės nuotrauka matoma be slinkimo', async ({
    page,
  }) => {
    const products = await Promise.all(
      ['Pistacijų', 'Avietinių', 'Šokoladinių'].map((n) =>
        createProduct(`${n} macarons ${Date.now()}`, [{ name: '6 vnt.', priceCents: 1200 }]),
      ),
    );
    await openWindow(products.map((product) => ({ product })));

    await page.goto(env.webUrl);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Vykstantys pardavimai' })).toHaveCount(0);
    const image = page.locator('.product-card .product-image').first();
    const box = await image.boundingBox();
    expect(box, 'pirmos prekės nuotrauka').not.toBeNull();
    expect(box!.y, 'nuotraukos viršus pirmame ekrane').toBeLessThan(812 - 24);
    await expectNoHorizontalScroll(page);
  });

  test('keli langai: skirtukai vienoje slenkamoje eilutėje, perjungia langą', async ({ page }) => {
    const cake = await createProduct(`Macarons rinkinys ${Date.now()}`);
    const titles = [`${LONG} pirmas`, 'Kalėdinis pardavimas', 'Naujųjų metų rinkiniai'];
    const first = await openWindow([{ product: cake }], titles[0]);
    const second = await openWindow([{ product: cake }], titles[1], { reset: false });
    await openWindow([{ product: cake }], titles[2], { reset: false });

    await page.goto(env.webUrl);
    const tabs = page.getByRole('navigation', { name: 'Vykstantys pardavimai' }).getByRole('link');
    await expect(tabs).toHaveCount(3);
    const tops = await tabs.evaluateAll((links) =>
      links.map((l) => Math.round(l.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size, 'skirtukai vienoje eilutėje').toBe(1);
    await expectNoHorizontalScroll(page);

    await page.goto(`${env.webUrl}/?langas=${second.id}`);
    await expect(page.getByRole('heading', { name: titles[1], level: 2 })).toBeVisible();
    await expect(tabs.filter({ hasText: titles[1] })).toHaveAttribute('aria-current', 'page');
    await tabs.filter({ hasText: titles[0] }).click();
    await expect(page).toHaveURL(new RegExp(`langas=${first.id}`));
    await expect(page.getByRole('heading', { level: 2 }).first()).toContainText('pirmas');
    await expectNoHorizontalScroll(page);
  });
});

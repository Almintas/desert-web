import {
  addToCart,
  adminApi,
  createProduct,
  env,
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

import {
  addToCart,
  createProduct,
  env,
  expect,
  fillCheckout,
  findOrders,
  getWindow,
  openWindow,
  submitButton,
  test,
} from './support';

/**
 * Projektas „turnstile-fail“: API paleistas su Cloudflare „visada atmeta“ secret
 * (2x0000000000000000000000000000000AA), o valdiklis duoda testinį tokeną (site key 1x…AA).
 */
test('Turnstile atmeta tokeną: rodomas pranešimas, užsakymas nesukuriamas', async ({ page }) => {
  const cake = await createProduct(`Turnstile tortas ${Date.now()}`);
  const w = await openWindow([{ product: cake, quantity: 10 }]);

  await page.goto(env.webUrl);
  await addToCart(page, w.items[0]!, 2);
  await page.goto(`${env.webUrl}/uzsakymas`);
  const who = await fillCheckout(page);
  await expect(submitButton(page)).toBeEnabled();
  await submitButton(page).click();

  await expect(page.locator('main').getByRole('alert')).toHaveText(
    'Nepavyko patvirtinti, kad esate ne robotas. Bandykite dar kartą.',
  );
  await expect(page).toHaveURL(/\/uzsakymas$/);
  expect(await findOrders(who.email)).toHaveLength(0);
  expect((await getWindow(w.id)).items[0]!.quantityAvailable).toBe(10);

  // Valdiklis perkrautas: gautas naujas tokenas, galima bandyti dar kartą.
  await expect(submitButton(page)).toBeEnabled();
});

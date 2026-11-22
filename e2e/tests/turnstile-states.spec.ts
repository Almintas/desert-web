import type { Page } from '@playwright/test';
import {
  addToCart,
  createProduct,
  env,
  expect,
  fillCheckout,
  openWindow,
  scriptTurnstile,
  submitButton,
  test,
} from './support';
import type { FakeWidgetOptions } from '../support/fake-turnstile.mjs';

/**
 * Turnstile valdiklio būsenos užsakymo formoje. Valdiklis pakeičiamas scenarijumi
 * (scriptTurnstile), todėl testai vienodi ir su tikru Cloudflare, ir be jo.
 */
test.describe('Turnstile būsenos užsakymo formoje', () => {
  async function openCheckout(page: Page, options: FakeWidgetOptions) {
    await scriptTurnstile(page, options);
    const cake = await createProduct(`Turnstile būsenos ${Date.now()}`);
    const w = await openWindow([{ product: cake, quantity: 10 }]);
    await page.goto(env.webUrl);
    await addToCart(page, w.items[0]!, 1);
    await page.goto(`${env.webUrl}/uzsakymas`);
    await fillCheckout(page);
  }

  const status = (page: Page) => page.locator('.turnstile-status');

  test('praeina: „Tikriname…“, tada „Patvirtinta“ ir mygtukas įjungiamas', async ({ page }) => {
    await openCheckout(page, { mode: 'pass', delayMs: 2500 });
    await expect(status(page)).toHaveText('Tikriname, ar esate ne robotas…');
    await expect(submitButton(page)).toBeDisabled();

    await expect(status(page)).toHaveText('✓ Patvirtinta');
    await expect(submitButton(page)).toBeEnabled();
  });

  test('reikia paspaudimo: prašoma pažymėti langelį, po to patvirtinta', async ({ page }) => {
    await openCheckout(page, { mode: 'interactive' });
    await expect(status(page)).toHaveText('Pažymėkite langelį, kad galėtumėte užsakyti.');
    await expect(submitButton(page)).toBeDisabled();

    await page.getByTestId('turnstile').getByRole('checkbox').check();
    await expect(status(page)).toHaveText('✓ Patvirtinta');
    await expect(submitButton(page)).toBeEnabled();
  });

  test('klaida: pranešimas ir „Bandyti dar kartą“ perkrauna valdiklį', async ({ page }) => {
    await openCheckout(page, { mode: 'pass', failTimes: 1 });
    await expect(status(page)).toContainText(
      'Nepavyko patikrinti. Atnaujinkite puslapį arba pabandykite kitą naršyklę.',
    );
    await expect(submitButton(page)).toBeDisabled();

    await page.getByRole('button', { name: 'Bandyti dar kartą' }).click();
    await expect(status(page)).toHaveText('✓ Patvirtinta');
    await expect(submitButton(page)).toBeEnabled();
  });

  test('naršyklė nepalaikoma: rodomas klaidos pranešimas', async ({ page }) => {
    await openCheckout(page, { mode: 'unsupported' });
    await expect(status(page)).toContainText('Nepavyko patikrinti.');
    await expect(page.getByRole('button', { name: 'Bandyti dar kartą' })).toBeVisible();
    await expect(submitButton(page)).toBeDisabled();
  });

  test('tokenas pasibaigė: tikrinama iš naujo automatiškai', async ({ page }) => {
    await openCheckout(page, { mode: 'pass', delayMs: 1500 });
    await expect(status(page)).toHaveText('✓ Patvirtinta');

    await page.evaluate(() =>
      (window as unknown as { __fakeTurnstile: { expire(): void } }).__fakeTurnstile.expire(),
    );
    await expect(status(page)).toHaveText('Patvirtinimas baigė galioti, tikriname iš naujo…');
    await expect(submitButton(page)).toBeDisabled();
    await expect(status(page)).toHaveText('✓ Patvirtinta');
    await expect(submitButton(page)).toBeEnabled();
  });
});

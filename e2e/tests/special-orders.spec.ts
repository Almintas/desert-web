import { addCalendarDays, shopToday, vilniusLocalToUtc } from '@desert-web/shared';
import {
  adminApi,
  createProduct,
  customer,
  env,
  expect,
  getSpecialOrderByToken,
  loginAdmin,
  placeSpecialOrder,
  setSpecialOrderSettings,
  test,
} from './support';

test.describe('Specialūs užsakymai (admin)', () => {
  test.afterAll(async () => {
    await setSpecialOrderSettings({ enabled: false, leadTimeDays: 7, maxDaysAhead: 90 });
  });

  test('įjungti nustatymuose → užklausa per API → patvirtinti → įvykdyti', async ({ page }) => {
    await setSpecialOrderSettings({ enabled: false, leadTimeDays: 7, maxDaysAhead: 90 });
    await loginAdmin(page);

    // 1. Nustatymai: įjungti ir pakeisti dienų ribas.
    await page.goto(`${env.adminUrl}/settings`);
    await expect(page.getByRole('heading', { name: 'Nustatymai', level: 1 })).toBeVisible();
    const enabled = page.getByLabel('Priimti specialius užsakymus');
    await expect(enabled).not.toBeChecked();
    await enabled.check();
    await page.getByLabel('Mažiausiai dienų iš anksto').fill('2');
    await page.getByLabel('Daugiausiai dienų į priekį').fill('60');
    await page.getByRole('button', { name: 'Išsaugoti', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Nustatymai išsaugoti.');
    await expect(page.getByLabel('Priimti specialius užsakymus')).toBeChecked();
    const config = await (await fetch(`${env.apiUrl}/special-orders/config`)).json();
    expect(config).toMatchObject({ enabled: true, leadTimeDays: 2, maxDaysAhead: 60 });

    // 2. Užklausa per API (kaip web serveris).
    const product = await createProduct(
      `Makaronų rinkinys ${Date.now()}`,
      [{ name: '24 vnt.', priceCents: 3000 }],
      { specialOrder: { enabled: true, minQuantity: 5 } },
    );
    const desiredDate = addCalendarDays(shopToday(), 10);
    const who = customer();
    const { specialOrder, accessToken } = await placeSpecialOrder(
      [{ variantId: product.variants[0]!.id, quantity: 8 }],
      desiredDate,
      who,
      'Vestuvėms, be riešutų',
    );

    // 3. Sąraše (numatytai aktyvios) ir navigacijoje su naujų skaičiumi.
    await page.goto(`${env.adminUrl}/special-orders`);
    await expect(page.locator('.sidebar .nav-count')).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: specialOrder.requestNumber });
    await expect(row).toContainText('Nauja užklausa');
    await expect(row).toContainText(who.name);
    await expect(row).toContainText('≈ 240,00');
    await row.getByRole('link', { name: specialOrder.requestNumber }).click();
    await expect(
      page.getByRole('heading', { name: `Užklausa ${specialOrder.requestNumber}` }),
    ).toBeVisible();
    await expect(page.getByText('Vestuvėms, be riešutų')).toBeVisible();
    // Naujai užklausai įvykdyti dar negalima.
    await expect(page.getByRole('button', { name: 'Pažymėti įvykdyta' })).toHaveCount(0);

    // 4. Patvirtinti: galutinė suma, atsiėmimo diena ir laikas Vilniaus laiku, vieta.
    await page.getByRole('button', { name: 'Patvirtinti', exact: true }).click();
    await expect(page.getByLabel('Galutinė suma, €')).toHaveValue('240,00');
    await expect(page.getByLabel('Atsiėmimo diena')).toHaveValue(desiredDate);
    // Be laiko ir vietos: formos klaidos, būsena nesikeičia.
    await page.getByRole('button', { name: 'Patvirtinti užklausą' }).click();
    await expect(page.getByText('Patikrink pažymėtus laukus.')).toBeVisible();
    await expect(page.getByText('Įvesk atsiėmimo vietą')).toBeVisible();

    await page.getByLabel('Galutinė suma, €').fill('225,50');
    await page.getByLabel(/^Nuo/).fill('10:00');
    await page.getByLabel(/^Iki/).fill('12:30');
    await page.getByLabel('Atsiėmimo vieta').fill('Gedimino pr. 1, Vilnius');
    await page.getByLabel('Žinutė pirkėjui (neprivaloma)').fill('Kaina su dėžutėmis.');
    await page.getByRole('button', { name: 'Patvirtinti užklausą' }).click();
    await expect(page.getByRole('status')).toHaveText('Užklausa patvirtinta.');
    await expect(page.locator('.page-header .badge')).toHaveText('Patvirtinta');
    await expect(page.getByText('Gedimino pr. 1, Vilnius')).toBeVisible();
    await expect(page.getByText('Kaina su dėžutėmis.')).toBeVisible();

    const confirmed = await getSpecialOrderByToken<{
      status: string;
      confirmation: { totalCents: number; pickupFrom: string; pickupTo: string };
    }>(accessToken);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmation).toMatchObject({
      totalCents: 22_550,
      pickupFrom: vilniusLocalToUtc(`${desiredDate}T10:00`)!.toISOString(),
      pickupTo: vilniusLocalToUtc(`${desiredDate}T12:30`)!.toISOString(),
    });
    // Patvirtintos atmesti nebegalima.
    await expect(page.getByRole('button', { name: 'Atmesti' })).toHaveCount(0);

    // 5. Įvykdyti: pažymima apmokėta.
    await page.getByRole('button', { name: 'Pažymėti įvykdyta' }).click();
    await page.getByRole('button', { name: 'Taip, pažymėti įvykdyta' }).click();
    await expect(page.getByRole('status')).toHaveText('Užklausa pažymėta įvykdyta ir apmokėta.');
    await expect(page.locator('.page-header .badge')).toHaveText('Įvykdyta');
    await expect(page.getByText('Apmokėtas')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Veiksmai' })).toHaveCount(0);
    const history = page.locator('.history li');
    await expect(history).toHaveCount(3);
    await expect(history.nth(1)).toContainText('admin@e2e.test');

    const done = await adminApi<{ status: string; payment: { status: string } }>(
      'GET',
      `/admin/special-orders/${specialOrder.id}`,
    );
    expect(done).toMatchObject({ status: 'completed', payment: { status: 'paid' } });

    // Aktyvių sąraše įvykdytos nebėra; skirtuke „Įvykdytos“ yra.
    await page.goto(`${env.adminUrl}/special-orders`);
    await expect(page.getByRole('row').filter({ hasText: specialOrder.requestNumber })).toHaveCount(
      0,
    );
    await page.getByRole('link', { name: /^Įvykdytos/ }).click();
    await expect(
      page.getByRole('row').filter({ hasText: specialOrder.requestNumber }),
    ).toBeVisible();
  });
});

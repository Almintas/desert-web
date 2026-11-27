import { formatEur } from '@desert-web/shared';
import {
  escapeHtml,
  type OrderEmailData,
  renderCustomerOrderReceived,
  renderCustomerOrderStatus,
  renderSellerNewOrder,
} from '../src/notifications/order-email-templates';

const data = (overrides: Partial<OrderEmailData> = {}): OrderEmailData => ({
  orderId: '665f1c2e8b3a4d0012345678',
  orderNumber: 'DW-2026-0042',
  customer: { name: 'Ona Onaitė', email: 'ona@example.com', phone: '+370 612 34567' },
  items: [
    {
      productName: 'Makaronai',
      variantName: '6 vnt.',
      quantity: 2,
      lineTotalCents: 1000,
      giftWrapQuantity: 0,
    },
    {
      productName: 'Medaus tortas',
      variantName: '1 kg',
      quantity: 1,
      lineTotalCents: 250,
      giftWrapQuantity: 0,
    },
  ],
  itemsTotalCents: 1250,
  giftWrapTotalCents: 0,
  totalCents: 1250,
  fulfillment: { method: 'pickup', address: null, notes: null },
  pickup: { location: 'Vilnius, Gedimino pr. 1', hours: '17:00–20:00' },
  cancellationReason: null,
  seller: {
    name: 'Ieva Pardavėja',
    businessId: '123456',
    address: 'Kaunas',
    email: 'ieva@pardave.example',
    phone: '',
  },
  orderUrl: 'https://desertai.lt/uzsakymas/AbCdEfGhIjKlMnOpQrStUvWxYz012345',
  adminOrderUrl: 'https://admin.desertai.lt/orders/665f1c2e8b3a4d0012345678',
  ...overrides,
});

/** Datų formatai naudoja nematomą žodžio jungtį (U+2060) ir NBSP („20\u00a0d.“). */
const visible = (s: string) => s.replace(/\u2060/g, '').replace(/\u00a0/g, ' ');

describe('Užsakymų laiškų šablonai', () => {
  it('suma lt-LT formatu (12,50 €), eilutės su kiekiais', () => {
    expect(formatEur(1250)).toMatch(/^12,50\s€$/);
    const { html, text } = renderCustomerOrderReceived(data());
    for (const body of [html, text]) {
      expect(body).toContain(formatEur(1250));
      expect(body).toContain('Makaronai 6 vnt.');
      expect(body).toContain('× 2');
      expect(body).toContain(formatEur(1000));
    }
  });

  it('atsiėmimas viena eilute: „Atsiėmimas: {vieta}, {laikas}“', () => {
    for (const email of [
      renderCustomerOrderReceived(data()),
      renderCustomerOrderStatus(data(), 'confirmed'),
      renderCustomerOrderStatus(data(), 'ready'),
      renderSellerNewOrder(data()),
    ]) {
      expect(visible(email.text)).toContain('Atsiėmimas: Vilnius, Gedimino pr. 1, 17:00–20:00');
      expect(email.text).not.toContain('Atsiėmimo vieta');
      expect(email.text).not.toContain('Atsiėmimo laikas');
    }
  });

  it('tekstinėje versijoje nėra nematomų simbolių', () => {
    expect(renderCustomerOrderReceived(data()).text).not.toMatch(/\u2060/);
  });

  it('nuorodos: pirkėjui į užsakymo puslapį, pardavėjui į admin', () => {
    const customer = renderCustomerOrderReceived(data());
    expect(customer.html).toContain(
      'href="https://desertai.lt/uzsakymas/AbCdEfGhIjKlMnOpQrStUvWxYz012345"',
    );
    expect(customer.text).toContain(
      'https://desertai.lt/uzsakymas/AbCdEfGhIjKlMnOpQrStUvWxYz012345',
    );

    const seller = renderSellerNewOrder(data());
    expect(seller.html).toContain(
      'href="https://admin.desertai.lt/orders/665f1c2e8b3a4d0012345678"',
    );
    expect(seller.html).toContain('href="tel:+37061234567"');
    expect(seller.html).toContain('href="mailto:ona@example.com"');
    expect(seller.html).not.toContain('/uzsakymas/');
  });

  it('be nuorodos (URL nenustatytas): mygtuko nėra', () => {
    const { html, text } = renderCustomerOrderReceived(data({ orderUrl: null }));
    expect(html).not.toContain('Peržiūrėti užsakymą');
    expect(text).not.toContain('http');
  });

  it('gautas: apmokėjimas atsiimant, pastabos, pardavėjo kontaktai', () => {
    const { subject, html, text } = renderCustomerOrderReceived(
      data({ fulfillment: { method: 'pickup', address: null, notes: 'Be riešutų' } }),
    );
    expect(subject).toBe('Gavome jūsų užsakymą DW-2026-0042');
    expect(text).toContain('Apmokėjimas: atsiimant');
    expect(text).toContain('Jūsų pastabos: Be riešutų');
    expect(html).toContain('Ieva Pardavėja');
    // Neužpildyti pardavėjo kontaktai (telefonas) praleidžiami, užpildyti rodomi.
    expect(html).toContain('ieva@pardave.example');
    expect(text).toContain('ieva@pardave.example');
    expect(text).not.toContain('ieva@pardave.example ·');
    expect(text).not.toMatch(/^\s*$\n^Šį laišką/m);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('name="viewport"');
    expect(html).not.toMatch(/<link|<img|<style/);
  });

  it('paruoštas: ryškus „Paruoštas atsiimti“, vieta ir laikas pakartoti, suma', () => {
    const { subject, html, text } = renderCustomerOrderStatus(data(), 'ready');
    expect(subject).toBe('Užsakymas DW-2026-0042 paruoštas atsiimti');
    expect(html).toMatch(/font-size:22px[^>]*>Paruoštas atsiimti</);
    expect(html).toContain('<strong>Vilnius, Gedimino pr. 1, 17:00–20:00</strong>');
    expect(text).toMatch(
      /^PARUOŠTAS ATSIIMTI\n\nAtsiėmimas: Vilnius, Gedimino pr\. 1, 17:00–20:00/,
    );
    expect(text).toContain(`Atsiimdami sumokėsite ${formatEur(1250)}.`);
  });

  it('patvirtintas', () => {
    const { subject, text } = renderCustomerOrderStatus(data(), 'confirmed');
    expect(subject).toBe('Užsakymas DW-2026-0042 patvirtintas');
    expect(text).toContain('patvirtinome');
  });

  it('atšauktas: su priežastimi ir be jos; nieko nenuskaičiuota', () => {
    const withReason = renderCustomerOrderStatus(
      data({ cancellationReason: 'Sugedo orkaitė\nAtsiprašome' }),
      'cancelled',
    );
    expect(withReason.subject).toBe('Užsakymas DW-2026-0042 atšauktas');
    expect(withReason.html).toContain('Sugedo orkaitė<br>Atsiprašome');
    expect(withReason.text).toContain('Priežastis: Sugedo orkaitė');
    expect(withReason.text).toContain('Nieko nenuskaičiavome');

    const without = renderCustomerOrderStatus(data(), 'cancelled');
    expect(without.html).not.toContain('Priežastis');
    expect(without.text).toContain('Nieko nenuskaičiavome');
  });

  it('pardavėjui: pirkėjo vardas, telefonas, el. paštas, pastabos', () => {
    const { subject, text } = renderSellerNewOrder(
      data({ fulfillment: { method: 'pickup', address: null, notes: 'Skambinti prieš' } }),
    );
    expect(subject).toBe(`Naujas užsakymas DW-2026-0042: Ona Onaitė, ${formatEur(1250)}`);
    expect(text).toContain('Vardas: Ona Onaitė');
    expect(text).toContain('Telefonas: +370 612 34567');
    expect(text).toContain('El. paštas: ona@example.com');
    expect(text).toContain('Pastabos: Skambinti prieš');
  });

  it('escape: vardas, pastabos, priežastis, prekės pavadinimas', () => {
    const evil = data({
      customer: { name: '<script>alert(1)</script>', email: 'a"b@example.com', phone: '+370' },
      items: [
        {
          productName: '<b>Tortas</b>',
          variantName: '1 kg',
          quantity: 1,
          lineTotalCents: 100,
          giftWrapQuantity: 0,
        },
      ],
      fulfillment: { method: 'pickup', address: null, notes: '"><img src=x onerror=alert(2)>' },
      cancellationReason: '<iframe src=//evil>',
    });
    const all = [
      renderCustomerOrderReceived(evil),
      renderCustomerOrderStatus(evil, 'confirmed'),
      renderCustomerOrderStatus(evil, 'ready'),
      renderCustomerOrderStatus(evil, 'cancelled'),
      renderSellerNewOrder(evil),
    ];
    for (const { html } of all) {
      expect(html).not.toMatch(/<script|<img|<iframe|<b>/);
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('&lt;b&gt;Tortas&lt;/b&gt;');
    }
    expect(all[0]!.html).toContain('&quot;&gt;&lt;img src=x onerror=alert(2)&gt;');
    expect(all[3]!.html).toContain('&lt;iframe src=//evil&gt;');
    expect(all[4]!.html).toContain('mailto:a&quot;b@example.com');
  });

  it('antraštėje nėra eilučių lūžių', () => {
    const { subject } = renderSellerNewOrder(
      data({
        customer: { name: 'Ona\r\nBcc: x@example.com', email: 'o@example.com', phone: '+370' },
      }),
    );
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('dovanų pakavimas: eilutė prie prekės ir sumų išskaidymas (HTML ir tekstas)', () => {
    const gift = data({
      items: [
        {
          productName: 'Makaronai',
          variantName: '6 vnt.',
          quantity: 3,
          lineTotalCents: 1500,
          giftWrapQuantity: 2,
        },
        {
          productName: 'Medaus tortas',
          variantName: '1 kg',
          quantity: 1,
          lineTotalCents: 250,
          giftWrapQuantity: 0,
        },
      ],
      itemsTotalCents: 1750,
      giftWrapTotalCents: 400,
      totalCents: 2150,
    });
    for (const email of [renderCustomerOrderReceived(gift), renderSellerNewOrder(gift)]) {
      for (const body of [email.html, email.text]) {
        expect(body.match(/Supakuoti kaip dovaną: 2 vnt\./g)).toHaveLength(1);
        expect(body).not.toContain('Supakuoti kaip dovaną: 0');
        expect(body).toContain('Prekės');
        expect(body).toContain('Dovanų pakavimas (2 vnt.)');
        expect(body).toContain(formatEur(1750));
        expect(body).toContain(formatEur(400));
        expect(body).toContain(formatEur(2150));
      }
    }
    const text = renderCustomerOrderReceived(gift).text;
    expect(text).toContain(
      [
        `- Makaronai 6 vnt. × 3: ${formatEur(1500)}`,
        '  Supakuoti kaip dovaną: 2 vnt.',
        `- Medaus tortas 1 kg × 1: ${formatEur(250)}`,
        `Prekės: ${formatEur(1750)}`,
        `Dovanų pakavimas (2 vnt.): ${formatEur(400)}`,
        `Iš viso: ${formatEur(2150)}`,
      ].join('\n'),
    );
  });

  it('be pakavimo: tik „Iš viso“ (be išskaidymo)', () => {
    for (const body of [
      renderCustomerOrderReceived(data()).text,
      renderCustomerOrderReceived(data()).html,
    ]) {
      expect(body).not.toContain('Dovanų pakavimas');
      expect(body).not.toContain('Supakuoti kaip dovaną');
      expect(body).toContain('Iš viso');
    }
  });

  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

/**
 * Visi užsakymų laiškai su pavyzdiniais duomenimis -> apps/api/tmp/email-preview/*.html
 * (ir .txt), kad būtų galima atsidaryti naršyklėje. Nei DB, nei Resend nereikia.
 *
 * Paleidimas: pnpm --filter @desert-web/api email:preview
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_PICKUP_INFO, DEFAULT_SHOP_INFO } from '@desert-web/shared';
import {
  CUSTOMER_STATUS_EMAILS,
  type OrderEmailData,
  renderCustomerOrderReceived,
  renderCustomerOrderStatus,
  renderSellerNewOrder,
  type RenderedEmail,
} from '../notifications/order-email-templates';

// dist/scripts/email-preview.js -> apps/api/tmp/email-preview
const OUT_DIR = resolve(__dirname, '..', '..', 'tmp', 'email-preview');

const sample: OrderEmailData = {
  seller: { ...DEFAULT_SHOP_INFO.seller, phone: '+370 600 12345' },
  orderId: '665f1c2e8b3a4d0012345678',
  orderNumber: 'DW-2026-0042',
  customer: { name: 'Ona Onaitė', email: 'ona@example.com', phone: '+370 612 34567' },
  items: [
    {
      productName: 'Makaronai',
      variantName: '6 vnt. dėžutė',
      quantity: 2,
      lineTotalCents: 1500,
      giftWrapQuantity: 2,
    },
    {
      productName: 'Medaus tortas',
      variantName: '1 kg',
      quantity: 1,
      lineTotalCents: 2500,
      giftWrapQuantity: 0,
    },
    {
      productName: 'Pistacijų pyragas',
      variantName: 'gabalėlis',
      quantity: 3,
      lineTotalCents: 1050,
      giftWrapQuantity: 1,
    },
  ],
  itemsTotalCents: 5050,
  giftWrapTotalCents: 600, // 3 vnt. × 2,00 €
  totalCents: 5650,
  fulfillment: {
    method: 'pickup',
    address: null,
    notes: 'Atvažiuosiu apie 15 val.\nJei galima, makaronus be riešutų.',
  },
  pickup: DEFAULT_PICKUP_INFO,
  cancellationReason: null,
  orderUrl: 'https://desertai.lt/uzsakymas/AbCdEfGhIjKlMnOpQrStUvWxYz012345',
  adminOrderUrl: 'https://admin.desertai.lt/orders/665f1c2e8b3a4d0012345678',
};

const previews: [string, RenderedEmail][] = [
  ['customer-order-received', renderCustomerOrderReceived(sample)],
  ...CUSTOMER_STATUS_EMAILS.map((status): [string, RenderedEmail] => [
    `customer-status-${status}`,
    renderCustomerOrderStatus(
      status === 'cancelled'
        ? { ...sample, cancellationReason: 'Deja, sugedo orkaitė.\nAtsiprašome!' }
        : sample,
      status,
    ),
  ]),
  ['customer-status-cancelled-no-reason', renderCustomerOrderStatus(sample, 'cancelled')],
  ['seller-new-order', renderSellerNewOrder(sample)],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, email] of previews) {
  writeFileSync(join(OUT_DIR, `${name}.html`), email.html);
  writeFileSync(join(OUT_DIR, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`);
}
const index = previews
  .map(
    ([name, email]) =>
      `<li><a href="${name}.html">${name}</a>: ${email.subject.replace(/[<>&]/g, '')}</li>`,
  )
  .join('\n');
writeFileSync(
  join(OUT_DIR, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Laiškų peržiūra</title><ul style="font-family:sans-serif">${index}</ul>\n`,
);
console.log(`Rendered ${previews.length} emails to ${OUT_DIR}`);
console.log(`Open ${join(OUT_DIR, 'index.html')}`);

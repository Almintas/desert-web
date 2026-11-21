import {
  type FulfillmentMethod,
  formatEur,
  formatPickupRange,
  SELLER,
  SHOP_NAME,
} from '@desert-web/shared';

/** Viskas, ko reikia užsakymo laiškams (iš užsakymo, jo lango ir konfigūracijos). */
export interface OrderEmailData {
  orderId: string;
  orderNumber: string;
  customer: { name: string; email: string; phone: string };
  items: {
    productName: string;
    variantName: string;
    quantity: number;
    lineTotalCents: number;
  }[];
  totalCents: number;
  fulfillment: { method: FulfillmentMethod; address: string | null; notes: string | null };
  pickup: { location: string | null; from: Date | string | null; to: Date | string | null };
  cancellationReason: string | null;
  /** `${WEB_URL}/uzsakymas/<accessToken>`; null, jei WEB_URL nenustatytas. */
  orderUrl: string | null;
  /** `${ADMIN_URL}/orders/<id>`; null, jei ADMIN_URL nenustatytas. */
  adminOrderUrl: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Būsenos, apie kurias pirkėjui rašom (pending ir completed laiško neturi). */
export const CUSTOMER_STATUS_EMAILS = ['confirmed', 'ready', 'cancelled'] as const;
export type CustomerStatusEmail = (typeof CUSTOMER_STATUS_EMAILS)[number];

// --- Pagalbinės funkcijos ---

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Kiekviena į HTML įterpiama reikšmė (ypač pirkėjo vardas, pastabos, priežastis) eina per čia. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/** Pastabos ir priežastis gali būti kelių eilučių: escape, tada <br>. */
const multiline = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>');

/** Antraštėje eilučių lūžių būti negali. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

const itemLabel = (i: OrderEmailData['items'][number]) => `${i.productName} ${i.variantName}`;

const COLORS = {
  page: '#f6f1eb',
  card: '#ffffff',
  text: '#2b2118',
  muted: '#7a6a5c',
  border: '#eadfd3',
  accent: '#8a4b2a',
  readyBg: '#e7f4e8',
  readyBorder: '#3f8f4a',
  readyText: '#1f5a28',
  cancelBg: '#fbecea',
  cancelBorder: '#c0473a',
} as const;

const FONT = 'Arial, Helvetica, sans-serif';

function pickupText(data: OrderEmailData): { place: string; time: string } {
  const { location, from, to } = data.pickup;
  return {
    place: location ?? 'Bus patikslinta',
    time: from && to ? formatPickupRange(from, to) : 'Bus patikslintas',
  };
}

/** Atsiėmimo (arba pristatymo) eilutės: [etiketė, reikšmė]. */
function fulfillmentRows(data: OrderEmailData): [string, string][] {
  if (data.fulfillment.method === 'delivery') {
    return [['Pristatymo adresas', data.fulfillment.address ?? 'Bus patikslintas']];
  }
  const { place, time } = pickupText(data);
  return [
    ['Atsiėmimo vieta', place],
    ['Atsiėmimo laikas', time],
  ];
}

// --- HTML dalys (inline stiliai, be išorinio CSS ir paveikslėlių) ---

function layout(options: {
  title: string;
  preheader: string;
  body: string;
  footer: string;
  orderNumber: string;
}) {
  // Užsakymo numeris (DW-2026-0042) neturi lūžti per brūkšnelį siauruose ekranuose.
  const number = escapeHtml(options.orderNumber);
  const body = options.body.replaceAll(
    number,
    `<span style="white-space:nowrap;">${number}</span>`,
  );
  return `<!doctype html>
<html lang="lt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.card};border-radius:8px;border:1px solid ${COLORS.border};">
<tr><td style="padding:24px 20px;font-family:${FONT};font-size:16px;line-height:1.5;color:${COLORS.text};">
<p style="margin:0 0 16px;font-size:14px;color:${COLORS.muted};">${escapeHtml(SHOP_NAME)}</p>
${body}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:16px 20px;font-family:${FONT};font-size:13px;line-height:1.5;color:${COLORS.muted};">
${options.footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

const h1 = (text: string) =>
  `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${COLORS.text};">${escapeHtml(text)}</h1>`;

const h2 = (text: string) =>
  `<h2 style="margin:24px 0 8px;font-size:17px;line-height:1.3;color:${COLORS.text};">${escapeHtml(text)}</h2>`;

/** `html` jau turi būti saugus (escape'intas). */
const p = (html: string) => `<p style="margin:0 0 12px;">${html}</p>`;

function itemsTableHtml(data: OrderEmailData): string {
  const rows = data.items
    .map(
      (i) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};">${escapeHtml(itemLabel(i))} <span style="color:${COLORS.muted};white-space:nowrap;">× ${i.quantity}</span></td>
<td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid ${COLORS.border};white-space:nowrap;">${escapeHtml(formatEur(i.lineTotalCents))}</td>
</tr>`,
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
${rows}
<tr>
<td style="padding:10px 0;font-weight:bold;">Iš viso</td>
<td align="right" style="padding:10px 0 10px 12px;font-weight:bold;white-space:nowrap;">${escapeHtml(formatEur(data.totalCents))}</td>
</tr>
</table>`;
}

/** Etiketė / reikšmė. Reikšmės HTML jau saugus. */
function detailsHtml(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([label, valueHtml]) => `<tr>
<td valign="top" style="padding:4px 12px 4px 0;color:${COLORS.muted};white-space:nowrap;">${escapeHtml(label)}</td>
<td valign="top" style="padding:4px 0;">${valueHtml}</td>
</tr>`,
    )
    .join('\n');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;">
${cells}
</table>`;
}

const plainRows = (rows: [string, string][]): [string, string][] =>
  rows.map(([label, value]) => [label, multiline(value)]);

function buttonHtml(url: string, label: string): string {
  const href = escapeHtml(url);
  return `<p style="margin:24px 0 8px;"><a href="${href}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">${escapeHtml(label)}</a></p>
<p style="margin:0 0 12px;font-size:13px;color:${COLORS.muted};word-break:break-all;">${href}</p>`;
}

function boxHtml(colors: { bg: string; border: string }, html: string): string {
  return `<div style="margin:0 0 16px;padding:16px;background:${colors.bg};border-left:4px solid ${colors.border};border-radius:4px;">${html}</div>`;
}

function customerFooterHtml(): string {
  return `${escapeHtml(SELLER.name)}<br>
<a href="mailto:${escapeHtml(SELLER.email)}" style="color:${COLORS.muted};">${escapeHtml(SELLER.email)}</a> · ${escapeHtml(SELLER.phone)}<br>
Šį laišką gavote, nes pateikėte užsakymą parduotuvėje ${escapeHtml(SHOP_NAME)}. Klausimų turite? Tiesiog atsakykite į šį laišką.`;
}

// --- Tekstinės dalys ---

function itemsText(data: OrderEmailData): string {
  const lines = data.items.map(
    (i) => `- ${itemLabel(i)} × ${i.quantity}: ${formatEur(i.lineTotalCents)}`,
  );
  return [...lines, `Iš viso: ${formatEur(data.totalCents)}`].join('\n');
}

const rowsText = (rows: [string, string][]) =>
  rows.map(([label, value]) => `${label}: ${value}`).join('\n');

function customerFooterText(): string {
  return [
    '--',
    SELLER.name,
    `${SELLER.email} · ${SELLER.phone}`,
    `Šį laišką gavote, nes pateikėte užsakymą parduotuvėje ${SHOP_NAME}. Klausimų turite? Tiesiog atsakykite į šį laišką.`,
  ].join('\n');
}

/** Tekstinė versija: be nematomų žodžio jungčių (U+2060), kurias naudoja datų formatai. */
const textDoc = (parts: (string | null | false)[]) =>
  `${parts
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join('\n\n')
    .replace(/\u2060/g, '')}\n`;

// --- Pirkėjui: užsakymas gautas ---

export function renderCustomerOrderReceived(data: OrderEmailData): RenderedEmail {
  const subject = `Gavome jūsų užsakymą ${data.orderNumber}`;
  const details: [string, string][] = [
    ...fulfillmentRows(data),
    ['Apmokėjimas', 'atsiimant'],
    ...(data.fulfillment.notes
      ? [['Jūsų pastabos', data.fulfillment.notes] as [string, string]]
      : []),
  ];
  const intro = `Sveiki, ${data.customer.name}! Ačiū, jūsų užsakymą gavome. Užsakymo numeris: ${data.orderNumber}.`;
  const next = 'Kai užsakymą patvirtinsime, parašysime dar kartą.';
  const linkIntro = 'Užsakymo būseną bet kada galite pasitikrinti čia:';

  const html = layout({
    title: subject,
    preheader: `Užsakymas ${data.orderNumber}, ${formatEur(data.totalCents)}. Apmokėjimas atsiimant.`,
    body: [
      h1('Ačiū, užsakymą gavome!'),
      p(escapeHtml(intro)),
      p(escapeHtml(next)),
      h2('Užsakymas'),
      itemsTableHtml(data),
      h2('Atsiėmimas ir apmokėjimas'),
      detailsHtml(plainRows(details)),
      data.orderUrl ? buttonHtml(data.orderUrl, 'Peržiūrėti užsakymą') : '',
    ].join('\n'),
    footer: customerFooterHtml(),
    orderNumber: data.orderNumber,
  });

  const text = textDoc([
    intro,
    next,
    `Užsakymas:\n${itemsText(data)}`,
    rowsText(details),
    data.orderUrl && `${linkIntro}\n${data.orderUrl}`,
    customerFooterText(),
  ]);
  return { subject, html, text };
}

// --- Pirkėjui: būsena pasikeitė ---

export function renderCustomerOrderStatus(
  data: OrderEmailData,
  status: CustomerStatusEmail,
): RenderedEmail {
  switch (status) {
    case 'confirmed':
      return renderConfirmed(data);
    case 'ready':
      return renderReady(data);
    case 'cancelled':
      return renderCancelled(data);
  }
}

function renderConfirmed(data: OrderEmailData): RenderedEmail {
  const subject = `Užsakymas ${data.orderNumber} patvirtintas`;
  const intro = `Sveiki, ${data.customer.name}! Jūsų užsakymą ${data.orderNumber} patvirtinome.`;
  const next = 'Parašysime, kai jis bus paruoštas atsiimti.';
  const details: [string, string][] = [...fulfillmentRows(data), ['Apmokėjimas', 'atsiimant']];

  const html = layout({
    title: subject,
    preheader: `Užsakymas ${data.orderNumber} patvirtintas. ${next}`,
    body: [
      h1('Užsakymas patvirtintas'),
      p(escapeHtml(intro)),
      p(escapeHtml(next)),
      h2('Užsakymas'),
      itemsTableHtml(data),
      h2('Atsiėmimas ir apmokėjimas'),
      detailsHtml(plainRows(details)),
      data.orderUrl ? buttonHtml(data.orderUrl, 'Peržiūrėti užsakymą') : '',
    ].join('\n'),
    footer: customerFooterHtml(),
    orderNumber: data.orderNumber,
  });

  const text = textDoc([
    intro,
    next,
    `Užsakymas:\n${itemsText(data)}`,
    rowsText(details),
    data.orderUrl && `Užsakymas internete:\n${data.orderUrl}`,
    customerFooterText(),
  ]);
  return { subject, html, text };
}

function renderReady(data: OrderEmailData): RenderedEmail {
  const subject = `Užsakymas ${data.orderNumber} paruoštas atsiimti`;
  const intro = `Sveiki, ${data.customer.name}! Jūsų užsakymas ${data.orderNumber} paruoštas atsiimti.`;
  const pay = `Atsiimdami sumokėsite ${formatEur(data.totalCents)}.`;
  const rows = fulfillmentRows(data);
  const readyHeading =
    data.fulfillment.method === 'delivery' ? 'Užsakymas paruoštas' : 'Paruoštas atsiimti';

  const box = boxHtml(
    { bg: COLORS.readyBg, border: COLORS.readyBorder },
    `<p style="margin:0 0 8px;font-size:22px;font-weight:bold;line-height:1.3;color:${COLORS.readyText};">${escapeHtml(readyHeading)}</p>
${detailsHtml(rows.map(([label, value]) => [label, `<strong>${multiline(value)}</strong>`]))}`,
  );

  const html = layout({
    title: subject,
    preheader: `${readyHeading}: ${rows.map(([, v]) => v).join(', ')}.`,
    body: [
      h1('Užsakymas paruoštas atsiimti'),
      box,
      p(escapeHtml(intro)),
      p(escapeHtml(pay)),
      h2('Užsakymas'),
      itemsTableHtml(data),
      data.orderUrl ? buttonHtml(data.orderUrl, 'Peržiūrėti užsakymą') : '',
    ].join('\n'),
    footer: customerFooterHtml(),
    orderNumber: data.orderNumber,
  });

  const text = textDoc([
    `${readyHeading.toUpperCase()}`,
    rowsText(rows),
    intro,
    pay,
    `Užsakymas:\n${itemsText(data)}`,
    data.orderUrl && `Užsakymas internete:\n${data.orderUrl}`,
    customerFooterText(),
  ]);
  return { subject, html, text };
}

function renderCancelled(data: OrderEmailData): RenderedEmail {
  const subject = `Užsakymas ${data.orderNumber} atšauktas`;
  const intro = `Sveiki, ${data.customer.name}! Jūsų užsakymas ${data.orderNumber} atšauktas.`;
  const charge =
    'Nieko nenuskaičiavome: užsakymas turėjo būti apmokamas atsiimant, todėl mokėti nieko nereikia.';
  const contact = 'Jei turite klausimų, tiesiog atsakykite į šį laišką.';
  const reason = data.cancellationReason;

  const html = layout({
    title: subject,
    preheader: `Užsakymas ${data.orderNumber} atšauktas. Mokėti nieko nereikia.`,
    body: [
      h1('Užsakymas atšauktas'),
      p(escapeHtml(intro)),
      reason
        ? boxHtml(
            { bg: COLORS.cancelBg, border: COLORS.cancelBorder },
            `<p style="margin:0 0 4px;color:${COLORS.muted};font-size:14px;">Priežastis</p><p style="margin:0;">${multiline(reason)}</p>`,
          )
        : '',
      p(escapeHtml(charge)),
      p(escapeHtml(contact)),
      h2('Atšauktas užsakymas'),
      itemsTableHtml(data),
      data.orderUrl ? buttonHtml(data.orderUrl, 'Peržiūrėti užsakymą') : '',
    ].join('\n'),
    footer: customerFooterHtml(),
    orderNumber: data.orderNumber,
  });

  const text = textDoc([
    intro,
    reason && `Priežastis: ${reason}`,
    charge,
    contact,
    `Atšauktas užsakymas:\n${itemsText(data)}`,
    data.orderUrl && `Užsakymas internete:\n${data.orderUrl}`,
    customerFooterText(),
  ]);
  return { subject, html, text };
}

// --- Pardavėjui: naujas užsakymas ---

export function renderSellerNewOrder(data: OrderEmailData): RenderedEmail {
  const { customer } = data;
  const subject = oneLine(
    `Naujas užsakymas ${data.orderNumber}: ${customer.name}, ${formatEur(data.totalCents)}`,
  );
  const phoneHref = customer.phone.replace(/[^\d+]/g, '');

  const customerRowsHtml: [string, string][] = [
    ['Vardas', escapeHtml(customer.name)],
    [
      'Telefonas',
      `<a href="tel:${escapeHtml(phoneHref)}" style="color:${COLORS.accent};">${escapeHtml(customer.phone)}</a>`,
    ],
    [
      'El. paštas',
      `<a href="mailto:${escapeHtml(customer.email)}" style="color:${COLORS.accent};">${escapeHtml(customer.email)}</a>`,
    ],
    ...(data.fulfillment.notes
      ? [['Pastabos', multiline(data.fulfillment.notes)] as [string, string]]
      : []),
  ];
  const customerRowsText: [string, string][] = [
    ['Vardas', customer.name],
    ['Telefonas', customer.phone],
    ['El. paštas', customer.email],
    ...(data.fulfillment.notes ? [['Pastabos', data.fulfillment.notes] as [string, string]] : []),
  ];
  const details: [string, string][] = [...fulfillmentRows(data), ['Apmokėjimas', 'atsiimant']];
  const intro = `Gautas naujas užsakymas ${data.orderNumber} (${formatEur(data.totalCents)}).`;

  const html = layout({
    title: subject,
    preheader: `${customer.name}, ${customer.phone}, ${formatEur(data.totalCents)}`,
    body: [
      h1(`Naujas užsakymas ${data.orderNumber}`),
      p(escapeHtml(intro)),
      h2('Pirkėjas'),
      detailsHtml(customerRowsHtml),
      h2('Prekės'),
      itemsTableHtml(data),
      h2('Atsiėmimas'),
      detailsHtml(plainRows(details)),
      data.adminOrderUrl ? buttonHtml(data.adminOrderUrl, 'Atidaryti admin panelėje') : '',
    ].join('\n'),
    footer: `${escapeHtml(SHOP_NAME)}: pranešimas apie naują užsakymą. Atsakius į šį laišką, atsakymas nueis pirkėjui.`,
    orderNumber: data.orderNumber,
  });

  const text = textDoc([
    intro,
    `Pirkėjas:\n${rowsText(customerRowsText)}`,
    `Prekės:\n${itemsText(data)}`,
    rowsText(details),
    data.adminOrderUrl && `Admin panelėje:\n${data.adminOrderUrl}`,
  ]);
  return { subject, html, text };
}

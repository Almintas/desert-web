import { createHash, randomUUID } from 'node:crypto';
import { test as base, type BrowserContext, expect, type Page } from '@playwright/test';
import { DUMMY_TOKEN, FAKE_WIDGET_SCRIPT } from '../support/fake-turnstile.mjs';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} nenustatytas: e2e paleidžiami per \`pnpm e2e\``);
  return value;
}

/** Aplinka iš scripts/run.mjs. */
export const env = {
  apiUrl: required('E2E_API_URL'),
  webUrl: required('E2E_WEB_URL'),
  adminUrl: required('E2E_ADMIN_URL'),
  adminEmail: required('E2E_ADMIN_EMAIL'),
  adminPassword: required('E2E_ADMIN_PASSWORD'),
  internalSecret: required('E2E_INTERNAL_SECRET'),
  cloudinary: {
    cloudName: required('E2E_CLOUDINARY_CLOUD_NAME'),
    apiSecret: required('E2E_CLOUDINARY_API_SECRET'),
    folder: required('E2E_CLOUDINARY_FOLDER'),
  },
  turnstileMode: process.env.E2E_TURNSTILE_MODE === 'real' ? 'real' : 'fake',
} as const;

/** 1×1 PNG vietoj Cloudinary nuotraukų. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Naršyklės užklausų perėmimas:
 * - api.cloudinary.com įkėlimas: atsakymas kaip Cloudinary, pasirašytas e2e API paslaptimi
 *   (API tikrina parašą, katalogą ir URL lygiai kaip produkcijoje);
 * - res.cloudinary.com nuotraukos: 1×1 PNG;
 * - Turnstile api.js: vietinis pakaitalas, jei Cloudflare nepasiekiamas (žr. run.mjs).
 */
async function interceptExternal(context: BrowserContext): Promise<void> {
  await context.route('https://api.cloudinary.com/**', async (route) => {
    const { cloudName, apiSecret, folder } = env.cloudinary;
    const publicId = `${folder}/e2e-${randomUUID()}`;
    const version = Math.floor(Date.now() / 1000);
    const signature = createHash('sha1')
      .update(`public_id=${publicId}&version=${version}${apiSecret}`)
      .digest('hex');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        public_id: publicId,
        version,
        signature,
        width: 800,
        height: 600,
        format: 'jpg',
        bytes: 12_345,
        secure_url: `https://res.cloudinary.com/${cloudName}/image/upload/v${version}/${publicId}.jpg`,
      }),
    });
  });
  await context.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );
  if (env.turnstileMode === 'fake') {
    await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: FAKE_WIDGET_SCRIPT,
      }),
    );
  }
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await interceptExternal(context);
    await use(context);
  },
});
export { expect };

// --- API (paruošimui ir patikrinimams; UI tikrinamas per naršyklę) ---

interface Variant {
  id: string;
  name: string;
  priceCents: number;
}
export interface Product {
  id: string;
  name: string;
  variants: Variant[];
}
export interface WindowItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  priceCents: number;
  quantityTotal: number;
  quantityAvailable: number;
}
export interface SaleWindow {
  id: string;
  title: string;
  phase: 'draft' | 'upcoming' | 'open' | 'closed' | 'cancelled';
  ordersCount: number;
  items: WindowItem[];
}

let cachedToken: string | null = null;

async function apiRaw(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function adminToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await apiRaw('POST', '/admin/auth/login', {
    body: { email: env.adminEmail, password: env.adminPassword },
  });
  if (res.status !== 200) throw new Error(`API login: ${res.status} ${JSON.stringify(res.body)}`);
  cachedToken = res.body.token as string;
  return cachedToken;
}

export async function adminApi<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await apiRaw(method, path, { body, token: await adminToken() });
  if (res.status >= 400) {
    throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as T;
}

const unique = () => randomUUID().slice(0, 8);

export async function createProduct(
  name: string,
  variants: { name: string; priceCents: number }[] = [{ name: '1 kg', priceCents: 2500 }],
): Promise<Product> {
  return adminApi<Product>('POST', '/admin/products', {
    name,
    slug: `e2e-${unique()}`,
    category: 'tortai',
    variants,
  });
}

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

/**
 * Sukuria ir iškart atidaro langą (open-now). Prieš tai uždaro / atšaukia kitus langus, kad
 * pagrindiniame puslapyje būtų rodomas būtent šis langas.
 */
export async function openWindow(
  items: { product: Product; variant?: number; quantity?: number; priceCents?: number }[],
  title = `E2E langas ${unique()}`,
): Promise<SaleWindow> {
  await resetWindows();
  const draft = await adminApi<SaleWindow>('POST', '/admin/sale-windows', {
    title,
    opensAt: iso(HOUR),
    closesAt: iso(48 * HOUR),
    fulfillment: {
      pickupAvailable: true,
      pickupLocation: 'Gedimino pr. 1, Vilnius',
      pickupFrom: iso(50 * HOUR),
      pickupTo: iso(52 * HOUR),
      deliveryAvailable: false,
    },
    items: items.map((i) => ({
      productId: i.product.id,
      variantId: i.product.variants[i.variant ?? 0]!.id,
      priceCents: i.priceCents ?? i.product.variants[i.variant ?? 0]!.priceCents,
      quantityTotal: i.quantity ?? 10,
    })),
  });
  return adminApi<SaleWindow>('POST', `/admin/sale-windows/${draft.id}/open-now`);
}

/** Atidarytus langus uždaro, būsimus ir juodraščius atšaukia. */
export async function resetWindows(): Promise<void> {
  const windows = await adminApi<SaleWindow[]>('GET', '/admin/sale-windows');
  for (const w of windows) {
    if (w.phase === 'open') await adminApi('POST', `/admin/sale-windows/${w.id}/close-now`);
    else if (w.phase === 'upcoming' || w.phase === 'draft') {
      await adminApi('POST', `/admin/sale-windows/${w.id}/cancel`);
    }
  }
}

export function getWindow(id: string): Promise<SaleWindow> {
  return adminApi<SaleWindow>('GET', `/admin/sale-windows/${id}`);
}

let customerSeq = 0;
export function customer() {
  customerSeq += 1;
  const n = `${Date.now() % 100000}${customerSeq}`.slice(-6).padStart(6, '0');
  return { name: `Pirkėjas ${n}`, email: `pirkejas-${unique()}@example.com`, phone: `+37060${n}` };
}

/** Užsakymas kaip iš web serverio (paslaptis + Turnstile testinis tokenas). */
export async function placeOrder(
  saleWindow: SaleWindow,
  items: { variantId: string; quantity: number }[],
  who = customer(),
): Promise<{ order: { id: string; orderNumber: string }; accessToken: string }> {
  const res = await apiRaw('POST', '/orders', {
    headers: { 'X-Internal-Secret': env.internalSecret, 'X-Client-IP': '203.0.113.200' },
    body: {
      clientRequestId: randomUUID(),
      saleWindowId: saleWindow.id,
      customer: who,
      items,
      fulfillment: { method: 'pickup' },
      turnstileToken: DUMMY_TOKEN,
    },
  });
  if (res.status !== 201)
    throw new Error(`POST /orders: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function findOrders(
  q: string,
): Promise<{ id: string; orderNumber: string; status: string }[]> {
  const res = await adminApi<{ items: { id: string; orderNumber: string; status: string }[] }>(
    'GET',
    `/admin/orders?q=${encodeURIComponent(q)}`,
  );
  return res.items;
}

// --- UI ---

export async function loginAdmin(page: Page): Promise<void> {
  await page.goto(`${env.adminUrl}/login`);
  await page.getByLabel('El. paštas').fill(env.adminEmail);
  await page.getByLabel('Slaptažodis').fill(env.adminPassword);
  await page.getByRole('button', { name: 'Prisijungti' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export const itemLabel = (i: Pick<WindowItem, 'productName' | 'variantName'>) =>
  `${i.productName} ${i.variantName}`;

export async function addToCart(page: Page, item: WindowItem, quantity: number): Promise<void> {
  const plus = page.getByRole('button', { name: `Didinti kiekį: ${itemLabel(item)}` });
  for (let i = 0; i < quantity; i++) await plus.click();
}

export async function fillCheckout(page: Page, who = customer()): Promise<typeof who> {
  await page.getByLabel('Vardas', { exact: true }).fill(who.name);
  await page.getByLabel('El. paštas').fill(who.email);
  await page.getByLabel('Telefonas').fill(who.phone);
  return who;
}

/** Užsakymo mygtukas (įjungiamas tik gavus Turnstile tokeną). */
export const submitButton = (page: Page) => page.getByRole('button', { name: /^Užsakyti už/ });

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontalus slinkimas: ${page.url()}`).toBeLessThanOrEqual(clientWidth);
}

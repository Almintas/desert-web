'use server';

import {
  type CreateOrderResponse,
  createOrderInputSchema,
  ORDER_ITEM_ERROR_CODES,
  type OrderItemProblemDto,
} from '@desert-web/shared';
import { ApiError, apiFetch, TOO_MANY_REQUESTS_MESSAGE } from '@/lib/api';
import { forwardedClientHeaders } from '@/lib/client-headers';
import { loadCurrentWindows } from '@/lib/window';
import type { CheckoutField, CheckoutState } from './checkout-state';

const FIELD_BY_PATH: Record<string, CheckoutField> = {
  'customer.name': 'name',
  'customer.email': 'email',
  'customer.phone': 'phone',
  'fulfillment.notes': 'notes',
};

const TURNSTILE_FAILED_MESSAGE = 'Nepavyko patvirtinti, kad esate ne robotas. Bandykite dar kartą.';
const TURNSTILE_UNAVAILABLE_MESSAGE =
  'Šiuo metu nepavyksta patikrinti užklausos. Bandykite dar kartą po minutės.';

const CLOSED_MESSAGE =
  'Pardavimas ką tik baigėsi, todėl užsakymo pateikti nebegalima. Jūsų krepšelis neišsiųstas.';

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function parseItems(raw: string): { variantId: string; quantity: number }[] {
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data)
      ? data.map((i: { variantId?: unknown; quantity?: unknown }) => ({
          variantId: String(i?.variantId ?? ''),
          quantity: Number(i?.quantity),
        }))
      : [];
  } catch {
    return [];
  }
}

function problemsFrom(body: unknown): OrderItemProblemDto[] {
  const items = (body as { details?: { items?: unknown } } | null)?.details?.items;
  return Array.isArray(items)
    ? items.filter(
        (p): p is OrderItemProblemDto =>
          !!p && typeof p.variantId === 'string' && typeof p.allowed === 'number',
      )
    : [];
}

/**
 * Pateikia užsakymą: POST /orders iš serverio su pirkėjo IP (X-Client-IP + INTERNAL_API_SECRET).
 * Visada tik atsiėmimas. clientRequestId sugeneruoja naršyklė vienam pateikimo bandymui ir
 * siunčia tą patį kartojant, todėl dvigubas paspaudimas ar pakartojimas sukuria vieną užsakymą.
 */
export async function placeOrderAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const windowId = text(formData, 'saleWindowId');
  const notes = text(formData, 'notes').trim();
  const input = {
    clientRequestId: text(formData, 'clientRequestId'),
    saleWindowId: windowId,
    customer: {
      name: text(formData, 'name'),
      email: text(formData, 'email'),
      phone: text(formData, 'phone'),
    },
    items: parseItems(text(formData, 'items')),
    fulfillment: { method: 'pickup' as const, notes: notes || undefined },
    turnstileToken: text(formData, 'turnstileToken').trim() || undefined,
  };

  const parsed = createOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<CheckoutField, string>> = {};
    let other: string | undefined;
    for (const issue of parsed.error.issues) {
      const field = FIELD_BY_PATH[issue.path.map(String).join('.')];
      if (field) fieldErrors[field] ??= issue.message;
      else other ??= issue.message;
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { status: 'error', message: 'Patikrinkite pažymėtus laukus.', fieldErrors };
    }
    return {
      status: 'error',
      message:
        input.items.length === 0
          ? 'Krepšelis tuščias.'
          : `Nepavyko pateikti užsakymo (${other ?? 'netinkami duomenys'}). Atnaujinkite puslapį ir bandykite dar kartą.`,
    };
  }

  let created: CreateOrderResponse;
  try {
    created = await apiFetch<CreateOrderResponse>('/orders', {
      method: 'POST',
      body: parsed.data,
      headers: await forwardedClientHeaders(),
    });
  } catch (error) {
    // Bet kokia klaida rodoma formoje (niekada ne bendras klaidos puslapis).
    if (!(error instanceof ApiError)) {
      console.error('[web] POST /orders nepavyko', error);
      return {
        status: 'error',
        message: 'Nepavyko susisiekti su parduotuve. Patikrinkite ryšį ir bandykite dar kartą.',
      };
    }
    const code = error.code;
    if (code === 'SALE_WINDOW_CLOSED' || code === 'SALE_WINDOW_NOT_FOUND') {
      return { status: 'closed', message: CLOSED_MESSAGE };
    }
    if (code && (ORDER_ITEM_ERROR_CODES as readonly string[]).includes(code)) {
      const current = await loadCurrentWindows();
      if (!current?.open || current.open.id !== windowId) {
        return { status: 'closed', message: CLOSED_MESSAGE };
      }
      return {
        status: 'stock',
        message: error.message,
        window: current.open,
        problems: problemsFrom(error.body),
      };
    }
    if (code === 'IDEMPOTENCY_CONFLICT') {
      return { status: 'error', message: error.message, resetRequestId: true };
    }
    if (code === 'FULFILLMENT_NOT_AVAILABLE') {
      return {
        status: 'error',
        message: 'Šiame pardavime atsiėmimas negalimas. Susisiekite su mumis.',
      };
    }
    if (error.status === 429 || code === 'TOO_MANY_REQUESTS') {
      return { status: 'error', message: TOO_MANY_REQUESTS_MESSAGE };
    }
    if (code === 'TURNSTILE_FAILED') {
      return { status: 'error', message: TURNSTILE_FAILED_MESSAGE };
    }
    if (code === 'TURNSTILE_UNAVAILABLE') {
      return { status: 'error', message: TURNSTILE_UNAVAILABLE_MESSAGE };
    }
    if (code === 'FORBIDDEN_CLIENT') {
      // Web ir API INTERNAL_API_SECRET nesutampa: konfigūracijos klaida, ne pirkėjo.
      console.error(
        '[web] API atmetė POST /orders: FORBIDDEN_CLIENT (patikrink INTERNAL_API_SECRET)',
      );
      return {
        status: 'error',
        message: 'Parduotuvėje įvyko klaida. Bandykite dar kartą po minutės.',
      };
    }
    if (error.status === 400) {
      const issues =
        (error.body as { issues?: { path: string; message: string }[] } | null)?.issues ?? [];
      const fieldErrors: Partial<Record<CheckoutField, string>> = {};
      for (const issue of issues) {
        const field = FIELD_BY_PATH[issue.path];
        if (field) fieldErrors[field] ??= issue.message;
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: 'error', message: 'Patikrinkite pažymėtus laukus.', fieldErrors };
      }
    }
    if (error.status >= 500) console.error('[web] POST /orders', error.status, error.body);
    return {
      status: 'error',
      message:
        error.status >= 500
          ? 'Parduotuvėje įvyko klaida. Bandykite dar kartą po minutės.'
          : error.message,
    };
  }

  return { status: 'success', accessToken: created.accessToken, windowId };
}

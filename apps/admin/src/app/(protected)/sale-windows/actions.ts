'use server';

import {
  type AdminSaleWindowDto,
  adminSaleWindowInputSchema,
  parseEurToCents,
  vilniusLocalToUtc,
} from '@desert-web/shared';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import { saleWindowApiErrorState } from './api-errors';
import { type SaleWindowFormState, WINDOW_COMMANDS, type WindowCommand } from './form-state';

const ITEM_KEY = /^items\.(\d+)\.row$/;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

async function adminToken(): Promise<string> {
  await requireAdmin();
  const token = await getSessionToken();
  if (!token) redirect('/login');
  return token;
}

/**
 * FormData -> API įvestis. Datos įvedamos Vilniaus laiku (datetime-local) ir verčiamos
 * į UTC ISO; kainos tekstu („12,50“) ir verčiamos centais. Formos klaidos (netinkama data,
 * kaina, nepasirinkta prekė) grąžinamos atskirai, o schemai perduodamos netinkamos reikšmės.
 */
function readSaleWindowForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const date = (key: string, required: boolean): string | undefined => {
    const raw = text(formData, key);
    if (!raw) {
      if (required) errors[key] = 'Įvesk datą ir laiką';
      return required ? '' : undefined;
    }
    const utc = vilniusLocalToUtc(raw);
    if (!utc) {
      errors[key] = 'Netinkama data';
      return '';
    }
    return utc.toISOString();
  };

  const integer = (raw: string): number => (/^\d+$/.test(raw) ? Number(raw) : Number.NaN);
  const optionalInteger = (raw: string): number | undefined => (raw ? integer(raw) : undefined);

  const indexes = [...new Set([...formData.keys()].flatMap((k) => ITEM_KEY.exec(k)?.[1] ?? []))]
    .map(Number)
    .sort((a, b) => a - b);
  const variantIds: string[] = [];
  const items = indexes.map((formIndex, i) => {
    const prefix = `items.${formIndex}`;
    const productId = text(formData, `${prefix}.productId`);
    const variantId = text(formData, `${prefix}.variantId`);
    variantIds.push(variantId);
    if (!productId || !variantId) errors[`items.${i}.variantId`] = 'Pasirink produktą ir variantą';

    const rawPrice = text(formData, `${prefix}.price`);
    const priceCents = parseEurToCents(rawPrice);
    if (priceCents === null) {
      errors[`items.${i}.priceCents`] = rawPrice ? 'Netinkama kaina (pvz., 12,50)' : 'Įvesk kainą';
    }
    return {
      productId,
      variantId,
      priceCents: priceCents ?? Number.NaN,
      quantityTotal: integer(text(formData, `${prefix}.quantityTotal`)),
      maxPerOrder: optionalInteger(text(formData, `${prefix}.maxPerOrder`)),
      maxPerCustomer: optionalInteger(text(formData, `${prefix}.maxPerCustomer`)),
    };
  });

  const pickupAvailable = formData.get('fulfillment.pickupAvailable') === 'on';
  const input = {
    title: text(formData, 'title'),
    opensAt: date('opensAt', true),
    closesAt: date('closesAt', true),
    fulfillment: {
      pickupAvailable,
      pickupLocation: text(formData, 'fulfillment.pickupLocation') || undefined,
      pickupFrom: date('fulfillment.pickupFrom', false),
      pickupTo: date('fulfillment.pickupTo', false),
      deliveryAvailable: formData.get('fulfillment.deliveryAvailable') === 'on',
    },
    items,
  };
  return { input, errors, variantIds };
}

/** Sukuria (windowId = null) arba atnaujina langą. Sėkmės atveju nukreipia į lango puslapį. */
export async function saveSaleWindowAction(
  windowId: string | null,
  _prev: SaleWindowFormState,
  formData: FormData,
): Promise<SaleWindowFormState> {
  const token = await adminToken();
  const { input, errors, variantIds } = readSaleWindowForm(formData);

  const parsed = adminSaleWindowInputSchema.safeParse(input);
  const fieldErrors: Record<string, string> = { ...errors };
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.map(String).join('.')] ??= issue.message;
    }
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { error: 'Patikrink pažymėtus laukus.', fieldErrors };
  }

  let saved: AdminSaleWindowDto;
  try {
    saved = await apiFetch<AdminSaleWindowDto>(
      windowId ? `/admin/sale-windows/${encodeURIComponent(windowId)}` : '/admin/sale-windows',
      { method: windowId ? 'PUT' : 'POST', body: parsed.data, token },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      return saleWindowApiErrorState(error, (id) => variantIds.indexOf(id));
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  redirect(`/sale-windows/${saved.id}?done=${windowId ? 'saved' : 'created'}`);
}

/** Būsenos veiksmai (publish, unpublish, open-now, close-now, cancel, delete). */
export async function saleWindowCommandAction(
  windowId: string,
  _prev: SaleWindowFormState,
  formData: FormData,
): Promise<SaleWindowFormState> {
  const token = await adminToken();
  const command = formData.get('command') as WindowCommand;
  if (!WINDOW_COMMANDS.includes(command)) return { error: 'Nežinomas veiksmas' };

  const path = `/admin/sale-windows/${encodeURIComponent(windowId)}`;
  try {
    await apiFetch(command === 'delete' ? path : `${path}/${command}`, {
      method: command === 'delete' ? 'DELETE' : 'POST',
      token,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      return saleWindowApiErrorState(error);
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  redirect(
    command === 'delete'
      ? '/sale-windows?done=deleted'
      : `/sale-windows/${windowId}?done=${command}`,
  );
}

export const SALE_WINDOW_STATUSES = ['draft', 'published', 'cancelled'] as const;
export type SaleWindowStatus = (typeof SALE_WINDOW_STATUSES)[number];

export const ORDER_STATUSES = ['pending', 'confirmed', 'ready', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SPECIAL_ORDER_STATUSES = [
  'requested',
  'confirmed',
  'rejected',
  'completed',
  'cancelled',
] as const;
export type SpecialOrderStatus = (typeof SPECIAL_ORDER_STATUSES)[number];

export const FULFILLMENT_METHODS = ['pickup', 'delivery'] as const;
export type FulfillmentMethod = (typeof FULFILLMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Kol kas tik apmokėjimas atsiimant (internetinių mokėjimų nėra). */
export const PAYMENT_METHODS = ['on_pickup'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ADMIN_ROLES = ['owner', 'staff'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const CURRENCY = 'EUR' as const;

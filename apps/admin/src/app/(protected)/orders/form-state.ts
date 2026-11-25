import type { OrderStatus } from '@desert-web/shared';

export interface OrderActionState {
  error?: string;
}

/** bulkStatusAction atsakymas. */
export interface BulkActionState {
  error?: string;
  /** Sėkmės (ar dalinės sėkmės) santrauka. */
  result?: {
    status: 'confirmed' | 'ready';
    updated: number;
    unchanged: number;
    failed: { orderNumber: string | null; status: OrderStatus | null; message: string }[];
  };
}

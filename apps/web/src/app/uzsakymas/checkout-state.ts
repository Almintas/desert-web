import type { OrderItemProblemDto, PublicSaleWindowDto } from '@desert-web/shared';

/** Laukai, kurių klaidos rodomos prie pačių laukų. */
export type CheckoutField = 'name' | 'email' | 'phone' | 'notes';

/** Server Action atsakymas (useActionState būsena). */
export type CheckoutState =
  | { status: 'idle' }
  | { status: 'success'; accessToken: string; windowId: string }
  /** Klaida formos viršuje ir (ar) prie laukų. */
  | {
      status: 'error';
      message: string;
      fieldErrors?: Partial<Record<CheckoutField, string>>;
      /** Užklausos ID jau panaudotas kitam užsakymui: naršyklė turi sugeneruoti naują. */
      resetRequestId?: boolean;
    }
  /** Kiekio ar limito klaida: naujas lango vaizdas ir API `details.items` krepšeliui pataisyti. */
  | {
      status: 'stock';
      message: string;
      window: PublicSaleWindowDto;
      problems: OrderItemProblemDto[];
    }
  /** Dovanų pakavimas nebegalimas (`variantIds`): naujas lango vaizdas krepšeliui pataisyti. */
  | {
      status: 'gift-wrap';
      message: string;
      window: PublicSaleWindowDto;
      variantIds: string[];
    }
  /** Langas uždarytas (arba jo nebėra). */
  | { status: 'closed'; message: string };

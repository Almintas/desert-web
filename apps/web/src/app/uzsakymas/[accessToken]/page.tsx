import { formatEur, type OrderAccessDto, type OrderStatus } from '@desert-web/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PickupInfo } from '@/components/pickup-info';
import { ApiError, apiFetch, TOO_MANY_REQUESTS_MESSAGE } from '@/lib/api';
import { forwardedClientHeaders } from '@/lib/client-headers';
import { formatDateTime } from '@/lib/format';
import { PAYMENT_TEXT } from '@/lib/shop';
import { CopyLink } from './copy-link';

// Užsakymo būsena keičiasi, o nuoroda slapta: niekada netalpinam (žr. ir proxy.ts antraštes).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Jūsų užsakymas',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Gautas, laukia patvirtinimo',
  confirmed: 'Patvirtintas',
  ready: 'Paruoštas, galite atsiimti',
  completed: 'Atsiimtas',
  cancelled: 'Atšauktas',
};

const ACCESS_TOKEN = /^[A-Za-z0-9_-]{32}$/;

async function loadOrder(token: string): Promise<OrderAccessDto | 'not-found' | 'too-many' | null> {
  if (!ACCESS_TOKEN.test(token)) return 'not-found';
  try {
    // Su pirkėjo IP: API riboja peržiūras pagal jį (60 per minutę), ne pagal web serverį.
    return await apiFetch<OrderAccessDto>(`/orders/access/${encodeURIComponent(token)}`, {
      headers: await forwardedClientHeaders(),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return 'not-found';
    if (error instanceof ApiError && error.status === 429) return 'too-many';
    console.error('[web] /orders/access failed', error);
    return null;
  }
}

export default async function OrderPage({ params }: { params: Promise<{ accessToken: string }> }) {
  const { accessToken } = await params;
  const order = await loadOrder(accessToken);

  if (order === 'not-found') notFound();
  if (order === 'too-many') {
    return (
      <section className="notice">
        <h1>Užsakymo dabar parodyti negalime</h1>
        <p>{TOO_MANY_REQUESTS_MESSAGE}</p>
      </section>
    );
  }
  if (!order) {
    return (
      <section className="notice">
        <h1>Šiuo metu nepavyksta parodyti užsakymo</h1>
        <p>Pabandykite po kelių minučių. Nuoroda į užsakymą lieka galioti.</p>
      </section>
    );
  }

  const cancelled = order.status === 'cancelled';
  const paid = order.payment?.status === 'paid';

  return (
    <article className="order-page">
      <header className="order-header">
        <p className="eyebrow">{cancelled ? 'Užsakymas atšauktas' : 'Ačiū! Užsakymą gavome'}</p>
        <h1>Užsakymas {order.orderNumber}</h1>
        <p className="muted">
          {order.saleWindow.title ? `${order.saleWindow.title} · ` : ''}pateiktas{' '}
          {formatDateTime(order.createdAt)}
        </p>
        <p className={`status-pill status-${order.status}`}>{STATUS_LABELS[order.status]}</p>
      </header>

      {cancelled ? (
        <div className="alert error" role="status">
          <p className="alert-title">Šis užsakymas atšauktas.</p>
          <p>
            Jo atsiimti ar apmokėti nereikia. Jei manote, kad tai klaida, susisiekite su mumis
            (kontaktai puslapio apačioje).
          </p>
        </div>
      ) : (
        <section className="save-link" aria-labelledby="save-link-heading">
          <h2 id="save-link-heading">Išsisaugokite šią nuorodą</h2>
          <p>
            Laiško nesiųsime: tai vienintelė vieta, kur matysite savo užsakymą ir jo būseną.
            Nukopijuokite nuorodą arba pasižymėkite šį puslapį.
          </p>
          <CopyLink />
        </section>
      )}

      <section className="checkout-section" aria-labelledby="items-heading">
        <h2 id="items-heading">Prekės</h2>
        <ul className="order-lines">
          {order.items.map((i) => (
            <li key={i.variantId}>
              <span className="order-line-name">
                {i.productName} <span className="muted">{i.variantName}</span>
              </span>
              <span className="order-line-qty">
                {i.quantity} × {formatEur(i.unitPriceCents)}
              </span>
              <span className="order-line-total">{formatEur(i.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <p className="cart-total">
          <span>Iš viso</span>
          <strong>{formatEur(order.totalCents)}</strong>
        </p>
      </section>

      {cancelled ? null : (
        <section className="checkout-section" aria-labelledby="pickup-heading">
          <h2 id="pickup-heading">Atsiėmimas ir apmokėjimas</h2>
          <PickupInfo
            location={order.saleWindow.pickupLocation}
            from={order.saleWindow.pickupFrom}
            to={order.saleWindow.pickupTo}
          />
          <dl className="pickup-info">
            <div>
              <dt>Apmokėjimas</dt>
              <dd>
                <span className={`payment-status ${paid ? 'paid' : 'unpaid'}`}>
                  {paid ? 'Apmokėta' : 'Neapmokėta'}
                </span>{' '}
                {paid ? null : PAYMENT_TEXT}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="checkout-section" aria-labelledby="contact-heading">
        <h2 id="contact-heading">Jūsų kontaktai</h2>
        <p>
          {order.customer.name}
          <br />
          {order.customer.email}
          <br />
          {order.customer.phone}
        </p>
        {order.fulfillment.notes ? (
          <p className="muted">Pastabos: {order.fulfillment.notes}</p>
        ) : null}
      </section>

      <p>
        <Link href="/">← Į parduotuvę</Link>
      </p>
    </article>
  );
}

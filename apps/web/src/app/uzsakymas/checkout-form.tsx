'use client';

import { formatEur, type PublicSaleWindowDto } from '@desert-web/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PickupInfo } from '@/components/pickup-info';
import { ProductImage } from '@/components/product-image';
import { Stepper } from '@/components/stepper';
import { Turnstile, type TurnstileHandle } from '@/components/turnstile';
import { adjustCart, maxQuantity } from '@/lib/cart-logic';
import { clearCart, useCart } from '@/lib/cart-store';
import { forgetRequestId, getRequestId, resetRequestId } from '@/lib/request-id';
import { PAYMENT_TEXT } from '@/lib/shop';
import { placeOrderAction } from './actions';
import type { CheckoutField, CheckoutState } from './checkout-state';

const INITIAL: CheckoutState = { status: 'idle' };

type Values = Record<CheckoutField, string>;

const TURNSTILE_ERROR =
  'Nepavyko patikrinti, kad esate ne robotas. Atnaujinkite puslapį ir bandykite dar kartą.';

export function CheckoutForm({
  saleWindow: initialWindow,
  turnstileSiteKey,
}: {
  saleWindow: PublicSaleWindowDto;
  /** Cloudflare Turnstile site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY, žr. lib/env.ts). */
  turnstileSiteKey: string;
}) {
  const router = useRouter();
  const [saleWindow, setSaleWindow] = useState(initialWindow);
  const cart = useCart(saleWindow);
  const [state, dispatch, pending] = useActionState(placeOrderAction, INITIAL);
  const [values, setValues] = useState<Values>({ name: '', email: '', phone: '', notes: '' });
  const [requestId, setRequestId] = useState<string | null>(null);
  const [cartChanges, setCartChanges] = useState<string[]>([]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);
  const submitting = useRef(false);
  const handled = useRef<CheckoutState>(INITIAL);
  const messageRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Vienas ID visam pateikimo bandymui (ir pakartojimams), žr. request-id.ts.
  useEffect(() => {
    setRequestId(getRequestId(saleWindow.id));
  }, [saleWindow.id]);

  // Server Action rezultatas: apdorojam kiekvieną naują būseną vieną kartą.
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    submitting.current = false;

    // Turnstile tokenas vienkartinis: po kiekvieno nepavykusio bandymo reikia naujo.
    if (state.status !== 'success') turnstile.current?.reset();

    switch (state.status) {
      case 'success':
        clearCart(state.windowId);
        forgetRequestId(state.windowId);
        router.replace(`/uzsakymas/${state.accessToken}`);
        return;
      case 'stock': {
        const adjusted = adjustCart(cart.lines, state.window, state.problems);
        cart.replace(adjusted.lines);
        setSaleWindow(state.window);
        setCartChanges(adjusted.changes.length > 0 ? adjusted.changes : [state.message]);
        break;
      }
      case 'error':
        if (state.resetRequestId) setRequestId(resetRequestId(saleWindow.id));
        break;
    }

    // Fokusas: pirmas klaidingas laukas, kitaip pranešimas.
    requestAnimationFrame(() => {
      const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      (invalid ?? messageRef.current)?.focus();
    });
  }, [state, cart, router, saleWindow.id]);

  const closed = state.status === 'closed';
  const done = state.status === 'success';
  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submitting.current || done || closed || !requestId || !turnstileToken) return;
    submitting.current = true;
    setCartChanges([]);
    const formData = new FormData(event.currentTarget);
    formData.set('turnstileToken', turnstileToken);
    formData.set(
      'items',
      JSON.stringify(cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }))),
    );
    startTransition(() => dispatch(formData));
  }

  const field = (name: CheckoutField) => ({
    id: `field-${name}`,
    name,
    value: values[name],
    onChange: (e: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [name]: e.target.value })),
    'aria-invalid': fieldErrors[name] ? true : undefined,
    'aria-describedby':
      [fieldErrors[name] ? `error-${name}` : '', name === 'phone' ? 'hint-phone' : '']
        .filter(Boolean)
        .join(' ') || undefined,
  });

  const fieldError = (name: CheckoutField) =>
    fieldErrors[name] ? (
      <p className="field-error" id={`error-${name}`}>
        {fieldErrors[name]}
      </p>
    ) : null;

  if (!cart.ready) {
    return <p className="muted">Įkeliamas krepšelis…</p>;
  }

  if (cart.lines.length === 0 && !done) {
    return (
      <section className="empty-cart">
        {cartChanges.length > 0 ? <CartChanges changes={cartChanges} /> : null}
        <p>Krepšelis tuščias.</p>
        <p>
          <Link href="/" className="button primary">
            Rinktis prekes
          </Link>
        </p>
      </section>
    );
  }

  const items = new Map(saleWindow.items.map((i) => [i.variantId, i]));

  return (
    <form ref={formRef} className="checkout" onSubmit={onSubmit} noValidate>
      <input type="hidden" name="saleWindowId" value={saleWindow.id} />
      <input type="hidden" name="clientRequestId" value={requestId ?? ''} />

      <section className="checkout-section" aria-labelledby="cart-heading">
        <h2 id="cart-heading">Jūsų krepšelis</h2>
        {cart.loadChanges.length > 0 ? (
          <CartChanges changes={cart.loadChanges} retry={false} />
        ) : null}
        {cartChanges.length > 0 ? (
          <div ref={messageRef} tabIndex={-1}>
            <CartChanges changes={cartChanges} />
          </div>
        ) : null}
        <ul className="cart-lines">
          {cart.lines.map((line) => {
            const item = items.get(line.variantId);
            if (!item) return null;
            return (
              <li key={line.variantId} className="cart-line">
                <ProductImage image={item.images[0]} alt="" eager={false} priority={false} />
                <div className="cart-line-body">
                  <p className="cart-line-name">
                    {item.productName}
                    <span className="muted"> {item.variantName}</span>
                  </p>
                  <p className="muted small">{formatEur(item.priceCents)} / vnt.</p>
                  <div className="cart-line-controls">
                    <Stepper
                      label={line.label}
                      value={line.quantity}
                      max={maxQuantity(item)}
                      onChange={(q) => cart.setQuantity(line.variantId, q)}
                    />
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => cart.setQuantity(line.variantId, 0)}
                      aria-label={`Pašalinti: ${line.label}`}
                    >
                      Pašalinti
                    </button>
                  </div>
                </div>
                <p className="cart-line-total">{formatEur(item.priceCents * line.quantity)}</p>
              </li>
            );
          })}
        </ul>
        <p className="cart-total">
          <span>Iš viso</span>
          <strong>{formatEur(cart.totalCents)}</strong>
        </p>
      </section>

      <section className="checkout-section" aria-labelledby="pickup-heading">
        <h2 id="pickup-heading">Atsiėmimas ir apmokėjimas</h2>
        <PickupInfo
          location={saleWindow.fulfillment.pickupLocation}
          from={saleWindow.fulfillment.pickupFrom}
          to={saleWindow.fulfillment.pickupTo}
        />
        <p className="payment-note">{PAYMENT_TEXT}</p>
      </section>

      <fieldset className="checkout-section" disabled={done}>
        <legend>
          <h2>Jūsų kontaktai</h2>
        </legend>
        <div className="field">
          <label htmlFor="field-name">Vardas</label>
          <input {...field('name')} autoComplete="name" maxLength={100} required />
          {fieldError('name')}
        </div>
        <div className="field">
          <label htmlFor="field-email">El. paštas</label>
          <input
            {...field('email')}
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={200}
            required
          />
          {fieldError('email')}
        </div>
        <div className="field">
          <label htmlFor="field-phone">Telefonas</label>
          <input
            {...field('phone')}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            maxLength={20}
            required
          />
          <p className="hint" id="hint-phone">
            +370 6xx xxxxx
          </p>
          {fieldError('phone')}
        </div>
        <div className="field">
          <label htmlFor="field-notes">
            Pastabos <span className="optional">(nebūtina)</span>
          </label>
          <textarea {...field('notes')} rows={3} maxLength={1000} />
          {fieldError('notes')}
        </div>
      </fieldset>

      <div className="checkout-submit">
        {state.status === 'error' || state.status === 'closed' ? (
          <div
            ref={cartChanges.length > 0 ? undefined : messageRef}
            tabIndex={-1}
            className="alert error"
            role="alert"
          >
            <p>{state.message}</p>
            {closed ? (
              <p>
                <Link href="/">Grįžti į parduotuvę</Link>
              </p>
            ) : null}
          </div>
        ) : null}
        <Turnstile
          ref={turnstile}
          siteKey={turnstileSiteKey}
          onToken={(token) => {
            setTurnstileToken(token);
            if (token) setTurnstileError(false);
          }}
          onError={() => setTurnstileError(true)}
        />
        {turnstileError ? (
          <p className="alert error" role="alert">
            {TURNSTILE_ERROR}
          </p>
        ) : !turnstileToken && !done && !closed ? (
          <p className="muted small" role="status">
            Tikriname, ar esate ne robotas…
          </p>
        ) : null}
        <p className="privacy-line">
          Jūsų duomenis naudosime tik šiam užsakymui įvykdyti ir susisiekti dėl atsiėmimo.{' '}
          <Link href="/privatumas">Privatumas</Link>
        </p>
        <button
          type="submit"
          className="button primary wide"
          disabled={pending || done || closed || !requestId || !turnstileToken}
        >
          {done
            ? 'Užsakymas pateiktas…'
            : pending
              ? 'Pateikiama…'
              : `Užsakyti už ${formatEur(cart.totalCents)}`}
        </button>
      </div>
    </form>
  );
}

function CartChanges({ changes, retry = true }: { changes: string[]; retry?: boolean }) {
  return (
    <div className="alert warning" role="status">
      <p className="alert-title">Krepšelis pakeistas:</p>
      <ul>
        {changes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {retry ? (
        <p className="small">Patikrinkite krepšelį ir pateikite užsakymą dar kartą.</p>
      ) : null}
    </div>
  );
}

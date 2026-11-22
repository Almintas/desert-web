'use client';

import {
  canGiftWrap,
  formatEur,
  PAYMENT_TEXT,
  type PublicSaleWindowDto,
  SELLER,
  telHref,
} from '@desert-web/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type RefObject,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AllergenLine } from '@/components/allergens';
import { ProductImage } from '@/components/product-image';
import { Stepper } from '@/components/stepper';
import { preloadTurnstile, Turnstile, type TurnstileHandle } from '@/components/turnstile';
import { adjustCart, giftWrapQuantityOf, maxQuantity, removeGiftWrap } from '@/lib/cart-logic';
import { clearCart, useCart } from '@/lib/cart-store';
import { formatDateTime, formatPickupWhen } from '@/lib/format';
import { forgetRequestId, getRequestId, resetRequestId } from '@/lib/request-id';
import { placeOrderAction } from './actions';
import type { CheckoutField, CheckoutState } from './checkout-state';
import { GiftWrapControl } from './gift-wrap-control';
import { SelectedProduct } from './selected-product';

const INITIAL: CheckoutState = { status: 'idle' };

type Values = Record<CheckoutField, string>;

export function CheckoutForm({
  saleWindow: initialWindow,
  backHref,
  selectedVariantId,
  turnstileSiteKey,
}: {
  saleWindow: PublicSaleWindowDto;
  /** Šio lango prekių puslapis. */
  backHref: string;
  /** Prekė, kurią pirkėjas atsidarė iš kortelės (`?preke=`, jau patikrinta, kad yra lange). */
  selectedVariantId: string | null;
  /** Cloudflare Turnstile site key (NEXT_TURNSTILE_SITE_KEY, žr. lib/env.ts). */
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
  const turnstile = useRef<TurnstileHandle>(null);
  const submitting = useRef(false);
  const handled = useRef<CheckoutState>(INITIAL);
  const messageRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  // Turnstile api.js pradedam krauti iškart, dar prieš įkeliant krepšelį ir rodant formą.
  useEffect(preloadTurnstile, []);

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
      case 'gift-wrap': {
        const adjusted = removeGiftWrap(cart.lines, state.window, state.variantIds);
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
    const items = new Map(saleWindow.items.map((i) => [i.variantId, i]));
    if (pending || submitting.current || done || closed || !requestId || !turnstileToken) return;
    if (cart.lines.length === 0) return;
    submitting.current = true;
    setCartChanges([]);
    const formData = new FormData(event.currentTarget);
    formData.set('turnstileToken', turnstileToken);
    formData.set(
      'items',
      JSON.stringify(
        cart.lines.map((l) => {
          const giftWrapQuantity = canGiftWrap(saleWindow, items.get(l.variantId))
            ? giftWrapQuantityOf(l)
            : 0;
          return {
            variantId: l.variantId,
            quantity: l.quantity,
            ...(giftWrapQuantity > 0 ? { giftWrapQuantity } : {}),
          };
        }),
      ),
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

  useStickyTop(summaryRef, cart.ready);

  if (!cart.ready) {
    return <p className="muted">Įkeliamas krepšelis…</p>;
  }

  const items = new Map(saleWindow.items.map((i) => [i.variantId, i]));
  // Kol krepšelis tuščias, kontaktų laukai matomi, bet užrakinti (įvestos reikšmės lieka).
  const empty = cart.lines.length === 0 && !done;
  // Pasirinkta prekė imama iš dabartinio lango: po likučių klaidos langas atnaujinamas.
  const selected = selectedVariantId ? items.get(selectedVariantId) : undefined;
  const variants = selected
    ? saleWindow.items.filter((i) => i.productId === selected.productId)
    : [];

  return (
    <form ref={formRef} className="checkout" onSubmit={onSubmit} noValidate>
      <input type="hidden" name="saleWindowId" value={saleWindow.id} />
      <input type="hidden" name="clientRequestId" value={requestId ?? ''} />

      {selected ? (
        <SelectedProduct
          variants={variants}
          giftWrapAvailable={saleWindow.giftWrap !== null}
          selectedVariantId={selected.variantId}
          quantityOf={cart.quantityOf}
          setQuantity={cart.setQuantity}
          backHref={backHref}
        />
      ) : null}

      {/* Plačiame ekrane dešinysis stulpelis (sticky), siaurame iškart po prekės. */}
      <aside ref={summaryRef} className="checkout-summary" aria-labelledby="cart-heading">
        <section className="checkout-section cart-summary">
          <h2 id="cart-heading">Jūsų krepšelis</h2>
          {cart.loadChanges.length > 0 ? (
            <CartChanges changes={cart.loadChanges} retry={false} />
          ) : null}
          {cartChanges.length > 0 ? (
            <div ref={messageRef} tabIndex={-1}>
              <CartChanges changes={cartChanges} />
            </div>
          ) : null}
          {empty ? (
            <div className="empty-cart">
              <p>Krepšelis tuščias.</p>
              {selected ? null : (
                <p>
                  <Link href={backHref} className="button primary">
                    Rinktis desertus
                  </Link>
                </p>
              )}
            </div>
          ) : null}
          <ul className="cart-lines" hidden={cart.lines.length === 0}>
            {cart.lines.map((line) => {
              const item = items.get(line.variantId);
              if (!item) return null;
              const giftWrap = canGiftWrap(saleWindow, item) ? saleWindow.giftWrap : null;
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
                    <AllergenLine allergens={item.allergens} />
                  </div>
                  <p className="cart-line-total">{formatEur(item.priceCents * line.quantity)}</p>
                  {/* Atskira eilutė po prekės (per tekstą ir sumą), kad telefone neliktų siaura. */}
                  {giftWrap ? (
                    <GiftWrapControl
                      label={line.label}
                      quantity={line.quantity}
                      giftWrapQuantity={giftWrapQuantityOf(line)}
                      priceCents={giftWrap.priceCents}
                      onChange={(g) => cart.setGiftWrap(line.variantId, g)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
          {empty ? null : (
            <>
              {cart.totals.giftWrapCount > 0 ? (
                <dl className="cart-subtotals">
                  <div>
                    <dt>Prekės</dt>
                    <dd>{formatEur(cart.totals.itemsCents)}</dd>
                  </div>
                  <div>
                    <dt>Dovanų pakavimas ({cart.totals.giftWrapCount} vnt.)</dt>
                    <dd>{formatEur(cart.totals.giftWrapCents)}</dd>
                  </div>
                </dl>
              ) : null}
              <p className="cart-total">
                <span>Iš viso</span>
                <strong>{formatEur(cart.totalCents)}</strong>
              </p>
            </>
          )}
          <CheckoutFacts saleWindow={saleWindow} />
          {(empty && !selected) || !(SELLER.email || SELLER.phone) ? null : (
            <p className="allergy-note">
              Jei turite alergijų ar klausimų dėl sudėties, prieš užsakydami susisiekite:{' '}
              {SELLER.email ? <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a> : null}
              {SELLER.email && SELLER.phone ? ' · ' : null}
              {SELLER.phone ? <a href={telHref(SELLER.phone)}>{SELLER.phone}</a> : null}
            </p>
          )}
        </section>
      </aside>

      <div className="checkout-main">
        {empty ? (
          <p className="alert info locked-note" id="contacts-locked">
            Pirmiausia pasirinkite kiekį – tada galėsite įvesti savo duomenis.
          </p>
        ) : null}
        <fieldset
          className={`checkout-section${empty ? ' locked' : ''}`}
          disabled={done || empty}
          aria-describedby={empty ? 'contacts-locked' : undefined}
        >
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
                  <Link href={backHref}>Grįžti į parduotuvę</Link>
                </p>
              ) : null}
            </div>
          ) : null}
          <Turnstile
            ref={turnstile}
            siteKey={turnstileSiteKey}
            onToken={setTurnstileToken}
            showStatus={!done && !closed}
          />
          <p className="privacy-line">
            Jūsų duomenis naudosime tik šiam užsakymui įvykdyti ir susisiekti dėl atsiėmimo.{' '}
            <Link href="/privatumas">Privatumas</Link>
          </p>
          <button
            type="submit"
            className="button primary wide"
            disabled={pending || done || closed || empty || !requestId || !turnstileToken}
          >
            {done
              ? 'Užsakymas pateiktas…'
              : pending
                ? 'Pateikiama…'
                : empty
                  ? 'Užsakyti'
                  : `Užsakyti už ${formatEur(cart.totalCents)}`}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Atstumas nuo ekrano viršaus prilipusiam krepšeliui (kaip 1.5rem CSS). */
const STICKY_GAP_REM = 1.5;

/**
 * Plačiame ekrane krepšelis `position: sticky`. Jei jis aukštesnis už ekraną, `top` tampa
 * neigiamas (--summary-top), kad prilimptų apačia: suma ir atsiėmimas lieka matomi, o
 * viršus atsiskleidžia slenkant atgal. Siaurame ekrane kintamasis nenaudojamas (žr. globals.css).
 */
function useStickyTop(ref: RefObject<HTMLElement | null>, ready: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = STICKY_GAP_REM * rem;
      const top = Math.min(gap, window.innerHeight - el.offsetHeight - gap);
      el.style.setProperty('--summary-top', `${Math.round(top)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, ready]);
}

/** Atsiėmimas, apmokėjimas ir lango pabaiga (parduotuvės laiku) po krepšelio suma. */
function CheckoutFacts({ saleWindow }: { saleWindow: PublicSaleWindowDto }) {
  const { pickupLocation, pickupFrom, pickupTo } = saleWindow.fulfillment;
  const when =
    pickupFrom && pickupTo ? formatPickupWhen(pickupFrom, pickupTo) : 'laikas bus patikslintas';
  return (
    <ul className="checkout-facts">
      <li>
        <strong>Atsiėmimas:</strong> {pickupLocation ?? 'vieta bus patikslinta'}, {when}
      </li>
      <li>{PAYMENT_TEXT}</li>
      <li>Užsakymai priimami iki {formatDateTime(saleWindow.closesAt)}</li>
    </ul>
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

'use client';

import { TURNSTILE_SCRIPT_URL } from '@desert-web/shared';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/** Cloudflare Turnstile naršyklės API (tik tai, ką naudojame). */
interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Įkelia api.js vieną kartą (explicit rendering). Nepavykus kitas kvietimas bando iš naujo. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile not found'));
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error('Failed to load Turnstile'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Pradeda krauti api.js iš anksto (pvz., kai užsakymo puslapis tik prijungtas, dar prieš
 * įkeliant krepšelį), kad valdiklis būtų paruoštas, kai forma atsiranda.
 */
export function preloadTurnstile(): void {
  loadTurnstile().catch(() => {
    // Klaidą parodys pats valdiklis, kai bandys krautis.
  });
}

/** Valdiklio būsena, pagal kurią rodomas tekstas po forma. */
export type TurnstileStatus = 'loading' | 'interactive' | 'verified' | 'expired' | 'error';

export interface TurnstileHandle {
  /** Naujas tokenas kitam bandymui (Cloudflare tokenai vienkartiniai). */
  reset(): void;
}

interface TurnstileProps {
  siteKey: string;
  /** Naujas tokenas arba null (pasibaigė, klaida, reset). */
  onToken(token: string | null): void;
  /** false: būsenos tekstas nerodomas (pvz., užsakymas jau pateiktas). */
  showStatus?: boolean;
}

/**
 * Cloudflare Turnstile valdiklis su būsenos tekstu.
 *
 * - `appearance: 'interaction-only'`: dažniausiai Cloudflare patikrina nematomai, o langelis
 *   atsiranda tik tada, kai tikrai reikia pirkėjo paspaudimo. Kol tikrina, rodom tekstą.
 * - `size: 'flexible'`: valdiklis (kai matomas) tokio pat pločio kaip užsakymo mygtukas.
 * - `language: 'lt'`. Režimas „Managed“ nustatomas Cloudflare valdiklio nustatymuose.
 * - Pasibaigusį tokeną atnaujinam patys (`refresh-expired: 'never'` + reset), o po klaidos
 *   nebandom automatiškai (`retry: 'never'`): pirkėjas mato aiškų pranešimą ir mygtuką.
 */
export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { siteKey, onToken, showStatus = true },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  // eslint-disable-next-line react-hooks/refs -- „latest ref“: naujausias onToken iškvietimams iš valdiklio callback'ų
  onTokenRef.current = onToken;
  const [status, setStatus] = useState<TurnstileStatus>('loading');
  /** Padidinus valdiklis kuriamas iš naujo (kai nepavyko įkelti api.js). */
  const [attempt, setAttempt] = useState(0);

  /** Naujas tokenas: esamą valdiklį perkraunam, o jei jo nėra, kuriam iš naujo. */
  function restart(next: TurnstileStatus = 'loading') {
    onTokenRef.current(null);
    setStatus(next);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    else setAttempt((a) => a + 1);
  }
  const restartRef = useRef(restart);
  // eslint-disable-next-line react-hooks/refs -- „latest ref“: naujausia funkcija iškvietimams iš valdiklio callback'ų
  restartRef.current = restart;

  useImperativeHandle(ref, () => ({ reset: () => restartRef.current() }), []);

  useEffect(() => {
    let cancelled = false;
    const fail = () => {
      if (cancelled) return;
      onTokenRef.current(null);
      setStatus('error');
    };
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widgetId.current = api.render(container.current, {
          sitekey: siteKey,
          action: 'checkout',
          language: 'lt',
          size: 'flexible',
          appearance: 'interaction-only',
          'refresh-expired': 'never',
          retry: 'never',
          callback: (token: string) => {
            if (cancelled) return;
            onTokenRef.current(token);
            setStatus('verified');
          },
          'before-interactive-callback': () => {
            if (!cancelled) setStatus('interactive');
          },
          'after-interactive-callback': () => {
            if (!cancelled) setStatus('loading');
          },
          'expired-callback': () => {
            if (!cancelled) restartRef.current('expired');
          },
          'error-callback': () => {
            fail();
            // true: klaida apdorota (Cloudflare jos neberašo į konsolę).
            return true;
          },
          'unsupported-callback': fail,
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, attempt]);

  return (
    <div className="turnstile-block">
      <div className="turnstile-status" role="status" data-status={status}>
        {showStatus ? <StatusText status={status} onRetry={() => restart()} /> : null}
      </div>
      <div ref={container} className="turnstile" data-testid="turnstile" />
    </div>
  );
});

function StatusText({ status, onRetry }: { status: TurnstileStatus; onRetry: () => void }) {
  switch (status) {
    case 'loading':
      return <p className="turnstile-text">Tikriname, ar esate ne robotas…</p>;
    case 'interactive':
      return (
        <p className="turnstile-text attention">Pažymėkite langelį, kad galėtumėte užsakyti.</p>
      );
    case 'verified':
      return (
        <p className="turnstile-text verified">
          <span aria-hidden="true">✓</span> Patvirtinta
        </p>
      );
    case 'expired':
      return <p className="turnstile-text">Patvirtinimas baigė galioti, tikriname iš naujo…</p>;
    case 'error':
      return (
        <div className="alert error turnstile-error">
          <p>Nepavyko patikrinti. Atnaujinkite puslapį arba pabandykite kitą naršyklę.</p>
          <button type="button" className="button secondary" onClick={onRetry}>
            Bandyti dar kartą
          </button>
        </div>
      );
  }
}

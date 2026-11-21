'use client';

import { TURNSTILE_SCRIPT_URL } from '@desert-web/shared';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

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

/** Įkelia api.js vieną kartą (explicit rendering). */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile not found'));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Turnstile'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  /** Naujas tokenas kitam bandymui (Cloudflare tokenai vienkartiniai). */
  reset(): void;
}

interface TurnstileProps {
  siteKey: string;
  /** Naujas tokenas arba null (pasibaigė, klaida, reset). */
  onToken(token: string | null): void;
  /** Valdiklis nepasikrovė ar Cloudflare jį atmetė. */
  onError(): void;
}

/**
 * Cloudflare Turnstile valdiklis: `appearance: 'interaction-only'` (matomas tik jei reikia
 * pirkėjo veiksmo), lietuvių kalba. Režimas „Managed“ nustatomas Cloudflare valdiklio
 * nustatymuose (site key), ne čia.
 */
export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { siteKey, onToken, onError },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };

  useImperativeHandle(ref, () => ({
    reset() {
      callbacks.current.onToken(null);
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widgetId.current = api.render(container.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          language: 'lt',
          action: 'checkout',
          'refresh-expired': 'auto',
          callback: (token: string) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onToken(null),
          'error-callback': () => {
            callbacks.current.onToken(null);
            callbacks.current.onError();
          },
        });
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onError();
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  return <div ref={container} className="turnstile" data-testid="turnstile" />;
});

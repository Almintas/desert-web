'use client';

import { useEffect, useRef, useState } from 'react';

/** Užsakymo nuoroda su mygtuku „Kopijuoti nuorodą“ (be Clipboard API: pažymi tekstą). */
export function CopyLink() {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState<'yes' | 'manual' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location pasiekiamas tik po hidratacijos
    setUrl(window.location.href.split('#')[0]!);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      inputRef.current?.select();
      setCopied('manual');
    }
  }

  return (
    <div className="copy-link">
      <label htmlFor="order-link" className="visually-hidden">
        Užsakymo nuoroda
      </label>
      <input
        ref={inputRef}
        id="order-link"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="button primary" onClick={copy} disabled={!url}>
        Kopijuoti nuorodą
      </button>
      <p className="copy-status" role="status" aria-live="polite">
        {copied === 'yes'
          ? 'Nuoroda nukopijuota.'
          : copied === 'manual'
            ? 'Nepavyko nukopijuoti automatiškai: nuoroda pažymėta, nukopijuokite ją patys.'
            : ''}
      </p>
    </div>
  );
}

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { SHOP_LOGO_SUBLINE, SHOP_NAME } from '@/lib/shop';
import {
  MACARON_COLORS,
  MACARON_DOT,
  MACARON_DOT_OFFSET,
  MACARON_PATHS,
  MACARON_VIEWBOX,
  WORDMARK_LINES,
  splitAtFirstI,
} from '@/lib/wordmark';

type WordmarkSize = 'header' | 'large';

/** Macaron vietoj „i“ taško; dekoratyvus. */
function MacaronDot() {
  const em = (n: number) => `${n}em`;
  const style: CSSProperties = {
    width: em(MACARON_DOT.width),
    height: em(MACARON_DOT.height),
    marginLeft: em(MACARON_DOT_OFFSET.marginLeft),
    marginRight: em(MACARON_DOT_OFFSET.marginRight),
    verticalAlign: em(MACARON_DOT_OFFSET.bottom),
  };
  return (
    <svg className="wordmark-dot" viewBox={MACARON_VIEWBOX} style={style} aria-hidden="true">
      <path d={MACARON_PATHS.top} fill={MACARON_COLORS.shell} />
      <path d={MACARON_PATHS.filling} fill={MACARON_COLORS.filling} />
      <path d={MACARON_PATHS.bottom} fill={MACARON_COLORS.shell} />
    </svg>
  );
}

function FirstLine({ word, macaron }: { word: string; macaron: boolean }) {
  const parts = macaron ? splitAtFirstI(word) : null;
  if (!parts) return <span className="wordmark-line">{word}</span>;
  return (
    <span className="wordmark-line">
      {parts.before}
      <MacaronDot />
      {parts.after}
    </span>
  );
}

/**
 * Tekstinis logotipas: „Vincento“ virš „Macarons“, po juo smulki eilutė (SHOP_LOGO_SUBLINE).
 * Ekrano skaitytuvams skaitomas kaip vienas pavadinimas (aria-label), dalys paslėptos.
 */
export function Wordmark({
  size = 'header',
  href,
  macaron = true,
  subline = SHOP_LOGO_SUBLINE,
  className,
}: {
  size?: WordmarkSize;
  /** Su adresu logotipas yra nuoroda (antraštėje: „/“). */
  href?: string;
  /** Macaron vietoj „i“ taško (išjungus rodomas įprastas taškas). */
  macaron?: boolean;
  subline?: string;
  className?: string;
}) {
  const [first = SHOP_NAME, ...rest] = WORDMARK_LINES;
  const classes = ['wordmark', `wordmark-${size}`, className].filter(Boolean).join(' ');
  const content = (
    <>
      <span className="wordmark-name" aria-hidden="true">
        <FirstLine word={first} macaron={macaron} />
        {rest.length > 0 && <span className="wordmark-line">{rest.join(' ')}</span>}
      </span>
      {subline && (
        <span className="wordmark-sub" aria-hidden="true">
          {subline}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-label={SHOP_NAME}>
        {content}
      </Link>
    );
  }
  return (
    <span className={classes} role="img" aria-label={SHOP_NAME}>
      {content}
    </span>
  );
}

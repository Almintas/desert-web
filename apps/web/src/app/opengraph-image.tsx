import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { SHOP_LOGO_SUBLINE, SHOP_NAME } from '@/lib/shop';
import { getShopInfo } from '@/lib/shop-info';
import {
  MACARON_COLORS,
  MACARON_DOT,
  MACARON_DOT_OFFSET,
  MACARON_PATHS,
  MACARON_VIEWBOX,
  WORDMARK_LINES,
  WORDMARK_WEIGHT,
  splitAtFirstI,
} from '@/lib/wordmark';

// Dalinimosi paveikslėlis (Facebook, Messenger, X ir kt.). Šūkis iš admin nustatymų: paveikslėlis
// perkuriamas ne dažniau kaip kas minutę (API nepasiekiamas: numatytasis šūkis).

export const alt = `${SHOP_NAME} – rankų darbo macarons`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Paletė kaip globals.css. */
const C = {
  bg: '#fbf6f0',
  warm: '#f6ece2',
  text: '#3a2a24',
  ink: '#241915',
  muted: '#6e5c55',
  accent: '#a3423a',
  accentSoft: '#f6e3df',
};

/**
 * Šriftai su lietuviškomis raidėmis (Latin Extended-A), saugomi _fonts/ (OFL licencija).
 * ImageResponse sisteminių šriftų nenaudoja, o WOFF2 nepalaiko, todėl TTF.
 */
async function loadFonts() {
  const dir = join(process.cwd(), 'src/app/_fonts');
  // Bodoni Moda: statinis egzempliorius iš kintamo šrifto (wght 400, opsz 96), tik lotyniškos raidės.
  const [display, body] = await Promise.all([
    readFile(join(dir, 'BodoniModa-Regular-opsz96.ttf')),
    readFile(join(dir, 'Manrope-Medium.ttf')),
  ]);
  return [
    { name: 'Bodoni Moda', data: display, weight: WORDMARK_WEIGHT, style: 'normal' as const },
    { name: 'Manrope', data: body, weight: 500 as const, style: 'normal' as const },
  ];
}

/** Macaron iš šono: kevalas, „kojelės“, įdaras, kojelės, kevalas. */
function Macaron({ shell, feet, filling }: { shell: string; feet: string; filling: string }) {
  return (
    <svg width="270" height="153" viewBox="0 0 300 170">
      <rect x="10" y="10" width="280" height="66" rx="33" fill={shell} />
      <ellipse cx="105" cy="32" rx="52" ry="9" fill="#ffffff" opacity="0.28" />
      <rect x="6" y="60" width="288" height="18" rx="7" fill={feet} />
      <rect x="18" y="76" width="264" height="22" rx="11" fill={filling} />
      <rect x="6" y="96" width="288" height="18" rx="7" fill={feet} />
      <rect x="10" y="102" width="280" height="58" rx="29" fill={shell} />
    </svg>
  );
}

/** Logotipo raidžių dydis (px) ir eilučių aukštis kaip svetainės antraštėje. */
const WORDMARK_SIZE = 140;
const WORDMARK_LINE_HEIGHT = 0.9;
/**
 * Bodoni Moda ascent / descent (2250 / 800 iš 2000): bazinės linijos atstumas nuo eilutės
 * viršaus, kai line-height 0.9 (pusė „leading“ neigiama).
 */
const BASELINE_FROM_TOP = (WORDMARK_LINE_HEIGHT - (1.125 + 0.4)) / 2 + 1.125;

/**
 * „Vincento“ virš „Macarons“, „i“ taškas – macaron. Satori nepalaiko vertical-align, todėl
 * macaron pozicionuojamas absoliučiai nuo „Vı“ dešinio krašto (ta pati em geometrija kaip
 * components/wordmark.tsx).
 */
function Wordmark() {
  const [first = SHOP_NAME, ...rest] = WORDMARK_LINES;
  const parts = splitAtFirstI(first);
  const px = (em: number) => em * WORDMARK_SIZE;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Bodoni Moda',
        fontWeight: WORDMARK_WEIGHT,
        fontSize: WORDMARK_SIZE,
        lineHeight: WORDMARK_LINE_HEIGHT,
        color: C.ink,
      }}
    >
      {parts ? (
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', position: 'relative' }}>
            {parts.before}
            <svg
              width={px(MACARON_DOT.width)}
              height={px(MACARON_DOT.height)}
              viewBox={MACARON_VIEWBOX}
              style={{
                position: 'absolute',
                // Dešinė paraštė (MACARON_DOT_OFFSET.marginRight) = atstumas iki ı dešinio krašto.
                right: px(MACARON_DOT_OFFSET.marginRight),
                top: px(BASELINE_FROM_TOP - MACARON_DOT_OFFSET.bottom - MACARON_DOT.height),
              }}
            >
              <path d={MACARON_PATHS.top} fill={MACARON_COLORS.shell} />
              <path d={MACARON_PATHS.filling} fill={MACARON_COLORS.filling} />
              <path d={MACARON_PATHS.bottom} fill={MACARON_COLORS.shell} />
            </svg>
          </div>
          {parts.after}
        </div>
      ) : (
        <div style={{ display: 'flex' }}>{first}</div>
      )}
      {rest.length > 0 && <div style={{ display: 'flex' }}>{rest.join(' ')}</div>}
    </div>
  );
}

export default async function OpengraphImage() {
  const { texts } = await getShopInfo();
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 80px 0 96px',
        background: `linear-gradient(135deg, ${C.bg} 0%, ${C.warm} 100%)`,
        color: C.text,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Wordmark />
        {SHOP_LOGO_SUBLINE && (
          <div
            style={{
              fontFamily: 'Manrope',
              fontSize: 24,
              lineHeight: 1,
              letterSpacing: '0.4em',
              color: C.muted,
              margin: `26px 0 0 ${WORDMARK_SIZE * 0.06}px`,
            }}
          >
            {SHOP_LOGO_SUBLINE}
          </div>
        )}
        <div
          style={{
            width: 72,
            height: 2,
            background: C.accent,
            opacity: 0.6,
            margin: '44px 0 30px 4px',
          }}
        />
        <div
          style={{
            fontFamily: 'Manrope',
            fontSize: 34,
            lineHeight: 1.3,
            color: C.muted,
            maxWidth: 640,
          }}
        >
          {texts.tagline}
        </div>
      </div>
      <div
        style={{
          width: 360,
          height: 360,
          borderRadius: 180,
          background: C.accentSoft,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', transform: 'translateX(-18px) rotate(-6deg)' }}>
          <Macaron shell="#e8aaa1" feet="#dc958c" filling="#fbf1e3" />
        </div>
        <div style={{ display: 'flex', transform: 'translateX(22px) rotate(4deg)' }}>
          <Macaron shell={C.accent} feet="#8f3830" filling="#f3d9cf" />
        </div>
      </div>
    </div>,
    { ...size, fonts: await loadFonts() },
  );
}

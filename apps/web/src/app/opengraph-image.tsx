import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { SHOP_NAME, SHOP_TAGLINE } from '@/lib/shop';

// Dalinimosi paveikslėlis (Facebook, Messenger, X ir kt.). Sugeneruojamas kompiliuojant.

export const alt = `${SHOP_NAME} – rankų darbo macarons`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Paletė kaip globals.css. */
const C = {
  bg: '#fbf6f0',
  warm: '#f6ece2',
  text: '#3a2a24',
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
  const [display, body] = await Promise.all([
    readFile(join(dir, 'CormorantGaramond-SemiBoldItalic.ttf')),
    readFile(join(dir, 'Manrope-Medium.ttf')),
  ]);
  return [
    { name: 'Cormorant Garamond', data: display, weight: 600 as const, style: 'italic' as const },
    { name: 'Manrope', data: body, weight: 500 as const, style: 'normal' as const },
  ];
}

/** Macaron iš šono: kevalas, „kojelės“, įdaras, kojelės, kevalas. */
function Macaron({ shell, feet, filling }: { shell: string; feet: string; filling: string }) {
  return (
    <svg width="300" height="170" viewBox="0 0 300 170">
      <rect x="10" y="10" width="280" height="66" rx="33" fill={shell} />
      <ellipse cx="105" cy="32" rx="52" ry="9" fill="#ffffff" opacity="0.28" />
      <rect x="6" y="60" width="288" height="18" rx="7" fill={feet} />
      <rect x="18" y="76" width="264" height="22" rx="11" fill={filling} />
      <rect x="6" y="96" width="288" height="18" rx="7" fill={feet} />
      <rect x="10" y="102" width="280" height="58" rx="29" fill={shell} />
    </svg>
  );
}

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 96px',
        background: `linear-gradient(135deg, ${C.bg} 0%, ${C.warm} 100%)`,
        color: C.text,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 640 }}>
        <div
          style={{
            fontFamily: 'Cormorant Garamond',
            fontStyle: 'italic',
            fontWeight: 600,
            fontSize: 124,
            lineHeight: 1,
            color: C.accent,
            letterSpacing: '0.01em',
          }}
        >
          {SHOP_NAME}
        </div>
        <div
          style={{
            width: 96,
            height: 4,
            borderRadius: 2,
            background: C.accent,
            margin: '36px 0 32px',
          }}
        />
        <div style={{ fontFamily: 'Manrope', fontSize: 38, lineHeight: 1.3, color: C.muted }}>
          {SHOP_TAGLINE}
        </div>
      </div>
      <div
        style={{
          width: 400,
          height: 400,
          borderRadius: 200,
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

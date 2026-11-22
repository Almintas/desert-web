import { ImageResponse } from 'next/og';

// iOS „Į pradžios ekraną“: nepermatomas fonas (permatomą iOS užpildo juodai).

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fbf6f0',
      }}
    >
      <svg width="124" height="124" viewBox="0 0 32 32">
        <rect x="2" y="5" width="28" height="10" rx="5" fill="#a3423a" />
        <rect x="4" y="14.5" width="24" height="4" rx="2" fill="#f2cfc6" />
        <rect x="2" y="18" width="28" height="9" rx="4.5" fill="#a3423a" />
      </svg>
    </div>,
    size,
  );
}

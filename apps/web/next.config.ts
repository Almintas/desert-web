import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { sellerBuildCheck } from './src/lib/seller-check';

export default function config(phase: string): NextConfig {
  // Vercel production build: neužpildyti pardavėjo duomenys (žr. seller-check.ts). Kol
  // BLOCK_PRODUCTION_WITHOUT_SELLER = false, tik įspėjimas build loge.
  if (phase === PHASE_PRODUCTION_BUILD) {
    const check = sellerBuildCheck();
    if (check?.action === 'throw') throw new Error(check.message);
    if (check?.action === 'warn') console.warn(check.message);
  }
  return {
    images: {
      remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
    },
  };
}

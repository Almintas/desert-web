import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { sellerBuildError } from './src/lib/seller-check';

export default function config(phase: string): NextConfig {
  // Vercel production build nepraeina, kol pardavėjo duomenys neužpildyti (žr. seller-check.ts).
  if (phase === PHASE_PRODUCTION_BUILD) {
    const error = sellerBuildError();
    if (error) throw new Error(error);
  }
  return {
    images: {
      remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
    },
  };
}

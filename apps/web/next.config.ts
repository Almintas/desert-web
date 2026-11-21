import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY įrašomas į kodą builde. Vercel produkciniame builde be jo
 * buildas sustabdomas (serveris be jo vis tiek nepasileistų, žr. src/instrumentation.ts).
 */
function assertBuildEnv(phase: string): void {
  if (phase !== PHASE_PRODUCTION_BUILD || process.env.VERCEL_ENV !== 'production') return;
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
    throw new Error(
      'Invalid environment variables (web):\n  - NEXT_PUBLIC_TURNSTILE_SITE_KEY: required ' +
        'in production. Value: Cloudflare → Turnstile → widget → Site key.',
    );
  }
}

export default function config(phase: string): NextConfig {
  assertBuildEnv(phase);
  return {
    images: {
      remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
    },
  };
}

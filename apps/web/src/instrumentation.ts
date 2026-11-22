/**
 * Paleidžiant web serverį (next start, Vercel funkcijos šaltas startas) patikrinami aplinkos
 * kintamieji: produkcijoje be API_URL serveris nepasileidžia, o klaida su paaiškinimu matoma
 * loguose (kaip API env.ts). Be INTERNAL_API_SECRET ar NEXT_TURNSTILE_SITE_KEY svetainė veikia,
 * tik užsakymai atmetami (žr. lib/env.ts), todėl čia tik klaidos eilutė loguose.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { ordersDisabledReason, validateWebEnv } = await import('./lib/env');
  try {
    const reason = ordersDisabledReason(validateWebEnv());
    if (reason) console.error(`[web] ${reason}`);
  } catch (error) {
    console.error(`[web] ${(error as Error).message}`);
    throw error;
  }
}

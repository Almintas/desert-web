/**
 * Paleidžiant web serverį (next start, Vercel funkcijos šaltas startas) patikrinami aplinkos
 * kintamieji: produkcijoje be API_URL ar INTERNAL_API_SECRET
 * serveris nepasileidžia, o klaida su paaiškinimu matoma loguose (kaip API env.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { validateWebEnv } = await import('./lib/env');
  try {
    validateWebEnv();
  } catch (error) {
    console.error(`[web] ${(error as Error).message}`);
    throw error;
  }
}

import { defineConfig } from 'vitest/config';

/** Tik gryna serverio logika (env, build patikros). UI tikrina e2e (`pnpm e2e`). */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

// Bendra bazinė ESLint konfigūracija (TS). Naudoja visi workspace'ai per nest.js / next.js
// arba tiesiogiai (shared, e2e). Prettier formatuoja, ESLint tikrina tik kodą.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Sugeneruoti ir build failai: niekada nelintinami. */
export const ignores = {
  name: 'desert-web/ignores',
  ignores: [
    '**/dist/**',
    '**/.next/**',
    '**/out/**',
    '**/next-env.d.ts',
    '**/coverage/**',
    '**/.turbo/**',
    '**/test-results/**',
    '**/playwright-report/**',
    '**/.logs/**',
  ],
};

/** Taisyklės, kurias visi workspace'ai naudoja vienodai. */
export const sharedRules = {
  name: 'desert-web/rules',
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
  },
};

export default defineConfig(
  ignores,
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    name: 'desert-web/node-globals',
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
  },
  {
    // CommonJS failai (pvz., jest.config.js): require/module.exports leidžiami.
    name: 'desert-web/commonjs',
    files: ['**/*.cjs', '**/jest.config.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  sharedRules,
  prettier,
);

// Next.js aplikacijos (apps/web, apps/admin): bazė + eslint-config-next (Next, React,
// react-hooks, jsx-a11y, import taisyklės). eslint-config-prettier dedamas paskutinis.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import base, { sharedRules } from './base.js';

export default [
  ...base,
  ...nextCoreWebVitals,
  {
    name: 'desert-web/next-overrides',
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Sąmoningai paprastas <img>, ne next/image: dydį ir formatą parenka Cloudinary
      // (cloudinaryImageUrl, f_auto + srcset), o admin peržiūros yra blob: URL'ai.
      '@next/next/no-img-element': 'off',
    },
  },
  sharedRules,
  prettier,
];

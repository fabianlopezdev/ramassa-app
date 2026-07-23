import js from '@eslint/js';
import i18next from 'eslint-plugin-i18next';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/.venv/',
      '.claude/skills/',
      'excalidraw-diagram/',
      '**/.expo/',
      '**/dist/',
      '**/.next/',
      '**/.open-next/',
      '**/out/',
      '**/coverage/',
      '**/.tanstack/',
      '**/routeTree.gen.ts',
      '**/.wrangler/',
      '**/worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Hardcoded user-facing strings are banned (RAPP-11, ADR-006): every string
    // a user can see goes through a translation key, so retrofit debt cannot
    // accumulate. Default rule options flag literal text in JSX markup. Tests
    // are exempt; they assert on rendered output.
    files: ['apps/*/src/**/*.{jsx,tsx}', 'packages/*/**/*.{jsx,tsx}'],
    ignores: ['**/*.test.jsx', '**/*.test.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': 'error',
    },
  },
  {
    // Errors are typed, never generic (RAPP-12, workflow contract rule 7):
    // app code throws AppError from @ramassa/shared/errors so every failure
    // carries a stable code, translated message, and Sentry-safe context.
    // Tests, config files, and the errors/env modules themselves are exempt.
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/**/*.{ts,tsx}', 'workers/*/src/**/*.ts'],
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      'packages/shared/errors/**',
      'packages/shared/env.ts',
      'workers/*/src/env.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ThrowStatement > NewExpression[callee.name='Error']",
          message:
            'Throw a typed AppError from @ramassa/shared/errors instead of a raw Error (RAPP-12).',
        },
      ],
    },
  },
  {
    // Metro, Babel, and Tailwind configs must stay CommonJS: their consumers
    // (Metro bundler, Babel) load them with require().
    files: ['**/*.config.js', '**/babel.config.js', '**/metro.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);

import js from '@eslint/js';
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
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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

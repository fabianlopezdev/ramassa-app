import js from '@eslint/js';
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
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);

import { createRequire } from 'node:module';
import { expect, test } from 'bun:test';
import { tokens } from '@ramassa/shared/tokens';

const require = createRequire(import.meta.url);
const tailwindConfig = require('./tailwind.config.js') as {
  theme: { extend: { lineHeight: Record<string, string> } };
};

test('mobile line-height utilities derive from the shared token scale', () => {
  expect(tailwindConfig.theme.extend.lineHeight).toEqual({
    body: `${tokens.lineHeight.body}px`,
  });
});

// Metro builds the app on Node, and NativeWind has Tailwind 3 load this config
// through its own jiti. That jiti reads zod 4.6 and later as undefined, so the
// config must reach no zod (RAPP-784). Bun loads it either way, so the check
// runs in Node, the way `expo export` does.
test('Tailwind loads this config in Node through its own loader', () => {
  const node = Bun.which('node');
  expect(node).not.toBeNull();
  const script = [
    "const loadConfig = require('tailwindcss/loadConfig');",
    "const config = loadConfig(require('node:path').resolve('tailwind.config.js'));",
    'process.stdout.write(JSON.stringify(config.theme.extend.colors.primary));',
  ].join('\n');
  const result = Bun.spawnSync([node!, '-e', script], {
    cwd: import.meta.dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(result.stderr.toString()).toBe('');
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({
    DEFAULT: 'rgb(var(--ramassa-primary-rgb) / <alpha-value>)',
    light: 'rgb(var(--ramassa-primary-light-rgb) / <alpha-value>)',
    dark: 'rgb(var(--ramassa-primary-dark-rgb) / <alpha-value>)',
  });
});

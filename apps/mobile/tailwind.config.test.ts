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

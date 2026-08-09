import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import arOnboarding from '../../../../packages/shared/i18n/locales/ar/onboarding.json';
import faOnboarding from '../../../../packages/shared/i18n/locales/fa/onboarding.json';

const termsScreenSource = readFileSync(
  join(import.meta.dir, '../app/(app)/onboarding/terms.tsx'),
  'utf8',
);
const termsBodyElement = termsScreenSource.match(
  /<Text className=\{`([^`]+)`\}>\s*\{t\('termsBody'\)\}\s*<\/Text>/,
);

test('the consent body component uses token-backed leading and the active language font', () => {
  expect(termsBodyElement).not.toBeNull();
  expect(termsBodyElement?.[1]).toContain('text-md');
  expect(termsBodyElement?.[1]).toContain('leading-body');
  expect(termsBodyElement?.[1]).toContain('${languageFontClass}');
  expect(termsBodyElement?.[1]).not.toContain('leading-6');
});

test('the typography contract covers real Arabic and Farsi consent copy', () => {
  expect(arOnboarding.termsBody).toMatch(/[\u0600-\u06ff]/);
  expect(faOnboarding.termsBody).toMatch(/[\u0600-\u06ff]/);
  expect(arOnboarding.termsBody).not.toBe(faOnboarding.termsBody);
});

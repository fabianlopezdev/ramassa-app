import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import arOnboarding from '../../../../packages/shared/i18n/locales/ar/onboarding.json';
import faOnboarding from '../../../../packages/shared/i18n/locales/fa/onboarding.json';

// The body both terms screens show (RAPP-613: onboarding and a new version).
const termsBodySource = readFileSync(
  join(import.meta.dir, '../components/onboarding/terms-body.tsx'),
  'utf8',
);
const termsBodyElement = termsBodySource.match(
  /<Text\s+(?:selectable\s+)?className=\{`([^`]+)`\}\s*>\s*\{body\}\s*<\/Text>/,
);

test('both terms screens show the body through that component', () => {
  for (const screen of ['../app/(app)/onboarding/terms.tsx', '../app/(app)/terms-update.tsx']) {
    expect(readFileSync(join(import.meta.dir, screen), 'utf8')).toContain('<TermsBody body=');
  }
});

test('the consent body component uses token-backed leading and the active language font', () => {
  expect(termsBodyElement).not.toBeNull();
  expect(termsBodyElement?.[1]).toContain('text-form');
  expect(termsBodyElement?.[1]).toContain('leading-body');
  expect(termsBodyElement?.[1]).toContain('${languageFontClass}');
  expect(termsBodyElement?.[1]).not.toContain('leading-6');
});

test('the typography contract covers real Arabic and Farsi consent copy', () => {
  expect(arOnboarding.termsBody).toMatch(/[\u0600-\u06ff]/);
  expect(faOnboarding.termsBody).toMatch(/[\u0600-\u06ff]/);
  expect(arOnboarding.termsBody).not.toBe(faOnboarding.termsBody);
});

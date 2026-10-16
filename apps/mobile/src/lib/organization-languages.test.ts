import { expect, test } from 'bun:test';
import { toggleOrganizationLanguage } from './organization-languages';

const all = { available: ['ca', 'es', 'en'] as const, defaultLanguage: 'es' as const };

test('a language goes off and on, and the locked one stays', () => {
  expect(toggleOrganizationLanguage(all, 'en', 'ca').available).toEqual(['ca', 'es']);
  expect(toggleOrganizationLanguage(all, 'ca', 'ca')).toBe(all);
  expect(
    toggleOrganizationLanguage({ available: ['ca'], defaultLanguage: 'ca' }, 'ar', 'ca').available,
  ).toEqual(['ca', 'ar']);
});

test('turning off the default moves it, and the last language stays on', () => {
  expect(toggleOrganizationLanguage(all, 'es', null)).toEqual({
    available: ['ca', 'en'],
    defaultLanguage: 'ca',
  });
  const only = { available: ['en'] as const, defaultLanguage: 'en' as const };
  expect(toggleOrganizationLanguage(only, 'en', null)).toBe(only);
});

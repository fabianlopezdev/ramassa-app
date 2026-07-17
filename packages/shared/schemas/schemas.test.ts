import { expect, test } from 'bun:test';
import {
  DEFAULT_LANGUAGE,
  emailSchema,
  languageCodeSchema,
  localizedTextSchema,
  uuidSchema,
} from './index';

test('languageCodeSchema accepts the five supported languages and rejects others', () => {
  for (const code of ['ca', 'es', 'en', 'ar', 'fa']) {
    expect(languageCodeSchema.safeParse(code).success).toBe(true);
  }
  expect(languageCodeSchema.safeParse('de').success).toBe(false);
});

test('Catalan is the default language', () => {
  expect(DEFAULT_LANGUAGE).toBe('ca');
});

test('localizedTextSchema requires Catalan and allows the rest to be partial', () => {
  expect(localizedTextSchema.safeParse({ ca: 'Entrenament' }).success).toBe(true);
  expect(localizedTextSchema.safeParse({ ca: 'Entrenament', ar: 'تدريب' }).success).toBe(true);
  expect(localizedTextSchema.safeParse({ es: 'Entrenamiento' }).success).toBe(false);
  expect(localizedTextSchema.safeParse({ ca: '' }).success).toBe(false);
});

test('uuid and email primitives validate', () => {
  expect(uuidSchema.safeParse('3f1e8c9a-0b2d-4e6f-8a1b-2c3d4e5f6a7b').success).toBe(true);
  expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  expect(emailSchema.safeParse('marc@ramassa.cat').success).toBe(true);
  expect(emailSchema.safeParse('nope').success).toBe(false);
});

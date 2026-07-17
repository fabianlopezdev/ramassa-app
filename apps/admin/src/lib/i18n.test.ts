import { describe, expect, test } from 'bun:test';
import { createAdminI18n, LANGUAGE_COOKIE_NAME, resolveClientLanguage } from './i18n';

describe('createAdminI18n', () => {
  test('boots in exactly the language it is given', () => {
    expect(createAdminI18n('ar').resolvedLanguage).toBe('ar');
    expect(createAdminI18n('ca').resolvedLanguage).toBe('ca');
  });

  test('instances are independent across calls (one per request on the server)', async () => {
    const first = createAdminI18n('es');
    const second = createAdminI18n('en');
    await first.changeLanguage('fa');
    expect(second.resolvedLanguage).toBe('en');
  });

  test('an explicit language switch persists the choice in the language cookie', async () => {
    const instance = createAdminI18n('ca');
    await instance.changeLanguage('es');
    expect(document.cookie).toContain(`${LANGUAGE_COOKIE_NAME}=es`);
  });
});

describe('resolveClientLanguage', () => {
  test('an existing language cookie wins over the browser languages', async () => {
    const instance = createAdminI18n('ca');
    await instance.changeLanguage('fa');
    expect(resolveClientLanguage()).toBe('fa');
  });
});

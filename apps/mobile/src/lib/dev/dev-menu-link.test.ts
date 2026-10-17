import { describe, expect, test } from 'bun:test';
import { resolveDevMenuLink } from './dev-menu-link';

describe('dev menu link', () => {
  test('is absent when the menu opens without a request', () => {
    expect(resolveDevMenuLink({})).toBeUndefined();
    expect(resolveDevMenuLink({ language: ' ', account: '' })).toBeUndefined();
  });

  test('pins a supported language', () => {
    const request = resolveDevMenuLink({ language: 'ca' });
    expect(request?.language).toBe('ca');
    expect(request?.problems).toEqual([]);
  });

  test('signs in only as an account the menu already lists', () => {
    const request = resolveDevMenuLink({ account: 'Amina.Alhassan@example.test' });
    expect(request?.account?.email).toBe('amina.alhassan@example.test');
    expect(request?.account?.password.length).toBeGreaterThan(0);
    expect(request?.problems).toEqual([]);

    expect(resolveDevMenuLink({ account: 'onboarding@example.test' })?.account).toBeDefined();
    expect(resolveDevMenuLink({ account: 'marta.puig@example.test' })?.account).toBeDefined();
  });

  test('reports what it cannot do instead of guessing', () => {
    const request = resolveDevMenuLink({ language: 'xx', account: 'nobody@example.test' });
    expect(request?.language).toBeUndefined();
    expect(request?.account).toBeUndefined();
    expect(request?.problems).toEqual([
      'unknown language "xx"',
      'no seeded account "nobody@example.test"',
    ]);
  });

  test('keys a request by what it asks for', () => {
    expect(resolveDevMenuLink({ language: 'ar' })?.key).not.toBe(
      resolveDevMenuLink({ language: 'ca' })?.key,
    );
  });
});

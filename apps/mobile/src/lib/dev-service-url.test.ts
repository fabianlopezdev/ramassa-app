import { expect, test } from 'bun:test';
import { resolveDevServiceUrl } from './dev-service-url';

const nativeDev = { isDev: true, platform: 'android', hostUri: '192.168.0.30:8081' };

test('physical native development reaches both local services through the Metro LAN host', () => {
  for (const port of [54321, 8787]) {
    expect(resolveDevServiceUrl(`http://127.0.0.1:${port}/`, nativeDev)).toBe(
      `http://192.168.0.30:${port}/`,
    );
  }
  expect(resolveDevServiceUrl('http://localhost:8787/branding/ramassa/logo', nativeDev)).toBe(
    'http://192.168.0.30:8787/branding/ramassa/logo',
  );
});

test('production, web, hosted services, missing settings, and tunnel hosts stay unchanged', () => {
  const local = 'http://127.0.0.1:54321';
  for (const context of [
    { ...nativeDev, isDev: false },
    { ...nativeDev, platform: 'web' },
    { ...nativeDev, hostUri: undefined },
    { ...nativeDev, hostUri: 'public.exp.direct:8081' },
    { ...nativeDev, hostUri: '8.8.8.8:8081' },
    { ...nativeDev, hostUri: 'localhost:8081' },
  ]) {
    expect(resolveDevServiceUrl(local, context)).toBe(local);
  }
  expect(resolveDevServiceUrl('https://project.supabase.co', nativeDev)).toBe(
    'https://project.supabase.co',
  );
  expect(resolveDevServiceUrl('http://192.168.0.99:54321', nativeDev)).toBe(
    'http://192.168.0.99:54321',
  );
  expect(resolveDevServiceUrl(undefined, nativeDev)).toBeUndefined();
});

test('iOS and Android emulator development preserve ports, paths, and queries', () => {
  expect(
    resolveDevServiceUrl('http://localhost:8787/a?b=1', {
      ...nativeDev,
      platform: 'ios',
      hostUri: 'http://10.0.2.2:8081',
    }),
  ).toBe('http://10.0.2.2:8787/a?b=1');
  expect(
    resolveDevServiceUrl('http://localhost:8787', {
      ...nativeDev,
      hostUri: '172.16.0.4:8081',
    }),
  ).toBe('http://172.16.0.4:8787/');
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'bun:test';
import { nativeTabsDirection, nativeTabsHostProps } from './native-tabs-direction';

test('the tab bar takes the direction React Native lays the screens out in', () => {
  expect(nativeTabsDirection(true)).toBe('rtl');
  expect(nativeTabsDirection(false)).toBe('ltr');
  expect(nativeTabsHostProps(true)).toEqual({ direction: 'rtl' });
});

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

test('every native tab bar passes the direction, so none keeps the phone language direction', () => {
  const layouts = sources(resolve(import.meta.dir, '../app')).filter((path) =>
    /<NativeTabs[\s>]/.test(readFileSync(path, 'utf8')),
  );
  expect(layouts.length).toBeGreaterThanOrEqual(3);
  for (const path of layouts) {
    expect([
      path,
      readFileSync(path, 'utf8').includes(
        'unstable_nativeProps={nativeTabsHostProps(I18nManager.isRTL)}',
      ),
    ]).toEqual([path, true]);
  }
});

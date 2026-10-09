import { describe, expect, test } from 'bun:test';
import {
  indexCode,
  missingKeys,
  orphanKeys,
  parityProblems,
  type Locales,
} from '../scripts/verify-i18n-keys';

const locales = (byLanguage: Record<string, Record<string, Record<string, string>>>): Locales =>
  new Map(
    Object.entries(byLanguage).map(([language, namespaces]) => [
      language,
      new Map(
        Object.entries(namespaces).map(([namespace, keys]) => [
          namespace,
          new Map(Object.entries(keys)),
        ]),
      ),
    ]),
  );

const five = (keys: Record<string, string>) => ({
  ca: { home: keys },
  es: { home: keys },
  en: { home: keys },
  ar: { home: keys },
  fa: { home: keys },
});

describe('parity', () => {
  test('a player namespace must exist in all five languages', () => {
    const withoutFarsi = Object.fromEntries(
      Object.entries(five({ title: 'x' })).filter(([language]) => language !== 'fa'),
    );
    expect(parityProblems(locales(withoutFarsi))).toEqual(['fa/home.json is missing']);
  });

  test('a staff-only namespace needs Catalan, Spanish and English only', () => {
    const keys = { title: 'x' };
    const result = parityProblems(
      locales({ ca: { services: keys }, es: { services: keys }, en: { services: keys } }),
    );
    expect(result).toEqual([]);
  });

  test('missing, extra and empty keys are reported', () => {
    const all = five({ title: 'x', body: 'y' });
    all.es = { home: { title: 'x', extra: 'z' } };
    all.en = { home: { title: ' ', body: 'y' } };
    expect(parityProblems(locales(all)).sort()).toEqual([
      'en/home: empty "title"',
      'es/home: extra "extra"',
      'es/home: missing "body"',
    ]);
  });

  test('placeholders must match, except count on a plural form', () => {
    const all = five({ greeting: 'Hola {{name}}', items_one: '{{count}} element' });
    all.ar = { home: { greeting: 'مرحبا', items_one: 'عنصر واحد' } };
    expect(parityProblems(locales(all))).toEqual(['ar/home: placeholders differ in "greeting"']);
  });
});

describe('usage', () => {
  const catalog = locales({
    ca: {
      home: {
        title: 'x',
        'status.open': 'x',
        fieldZone: 'x',
        fieldPhone: 'x',
        items_one: 'x',
        items_other: 'x',
        unused: 'x',
      },
    },
  });

  test('literal, prefix, camelCase, runtime-namespace and plural uses all count', () => {
    const code = indexCode([
      "t('title'); t(`status.${value}`); t(`${ns}:fieldZone`); t('items', { count });",
      'const label = t(`field${name}`);',
    ]);
    expect(orphanKeys(catalog, code)).toEqual(['home:unused']);
  });

  test('a literal namespace:key that does not exist is reported', () => {
    const code = indexCode(["t('home:title'); t('home:status'); t('home:gone')"]);
    expect(missingKeys(catalog, code)).toEqual(['home:gone']);
  });
});

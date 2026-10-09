/**
 * Translation key gate (RAPP-120): `bun run qa:i18n-keys`, also run in CI.
 *
 * 1. Parity: every namespace has the same keys, non-empty texts and the same
 *    `{{placeholders}}` in each language it must ship in. Staff-only namespaces
 *    ship in Catalan, Spanish and English (ADR-026); every other namespace is
 *    seen by players and ships in all five languages (ADR-006).
 * 2. Missing: every literal `namespace:key` in the code exists in Catalan.
 * 3. Orphans: every Catalan key is used by the code. Keys the code builds at
 *    runtime count as used through their literal prefix (`status.${value}`).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glob } from 'bun';

export const PLAYER_LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'] as const;
export const STAFF_LANGUAGES = ['ca', 'es', 'en'] as const;

// Namespaces only the web admin and entity portal render.
export const STAFF_ONLY_NAMESPACES = new Set([
  'admin',
  'announcements',
  'entity-management',
  'entity-services',
  'notifications',
  'participants',
  'referrals',
  'services',
  'settings',
]);

// Keys that exist in Catalan only, on purpose.
const CATALAN_ONLY_KEYS = new Set([
  // create-i18n.test.ts proves that a key missing in another language falls back to Catalan.
  'common:fallbackSentinel',
]);

type Catalog = { readonly [key: string]: string | Catalog };

export const flatten = (catalog: Catalog, prefix = ''): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
};

const PLURAL_FORM = /_(zero|one|two|few|many|other)$/;

// A plural form may leave out `{{count}}` where the word itself says the number
// (Arabic "طلب واحد" is "one request"), so `count` is not compared on plural keys.
const placeholders = (key: string, text: string): string =>
  [...text.matchAll(/{{\s*([\w.]+)[^}]*}}/g)]
    .map((match) => match[1] ?? '')
    .filter((name) => !(PLURAL_FORM.test(key) && name === 'count'))
    .sort()
    .join(',');

export type Locales = ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, string>>>;

export const parityProblems = (locales: Locales): string[] => {
  const problems: string[] = [];
  const reference = locales.get('ca') ?? new Map();
  for (const [namespace, keys] of reference) {
    const required = STAFF_ONLY_NAMESPACES.has(namespace) ? STAFF_LANGUAGES : PLAYER_LANGUAGES;
    for (const language of required) {
      const catalog = locales.get(language)?.get(namespace);
      if (catalog === undefined) {
        problems.push(`${language}/${namespace}.json is missing`);
        continue;
      }
      for (const [key, text] of keys) {
        if (language !== 'ca' && CATALAN_ONLY_KEYS.has(`${namespace}:${key}`)) continue;
        const translated = catalog.get(key);
        if (translated === undefined) problems.push(`${language}/${namespace}: missing "${key}"`);
        else if (translated.trim().length === 0)
          problems.push(`${language}/${namespace}: empty "${key}"`);
        else if (placeholders(key, translated) !== placeholders(key, text))
          problems.push(`${language}/${namespace}: placeholders differ in "${key}"`);
      }
      for (const key of catalog.keys()) {
        if (!keys.has(key)) problems.push(`${language}/${namespace}: extra "${key}"`);
      }
    }
  }
  return problems;
};

export type CodeIndex = {
  readonly literals: ReadonlySet<string>;
  readonly prefixes: readonly string[];
  // Keys written after a runtime namespace, as in `${labelNamespace}:fieldZone`.
  readonly anyNamespaceKeys: ReadonlySet<string>;
};

// Every string literal and every template-literal head in the code.
export const indexCode = (sources: readonly string[]): CodeIndex => {
  const literals = new Set<string>();
  const prefixes: string[] = [];
  const anyNamespaceKeys = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/(['"])((?:(?!\1)[^\\\n]|\\.)+)\1/g)) {
      literals.add(match[2] ?? '');
    }
    for (const match of source.matchAll(/`([^`$]*)\$\{/g)) {
      const head = match[1] ?? '';
      if (head.length > 0) prefixes.push(head);
    }
    for (const match of source.matchAll(/\}:([A-Za-z][\w.]*)`/g)) {
      anyNamespaceKeys.add(match[1] ?? '');
    }
  }
  return { literals, prefixes, anyNamespaceKeys };
};

// A runtime-built key counts through its literal head: `status.${value}` covers
// `status.open`, and `field${Name}` covers `fieldProviderName` (camelCase join).
const coversKey = (prefix: string, key: string): boolean => {
  if (!key.startsWith(prefix) || key.length === prefix.length) return false;
  if (/[.:_-]$/.test(prefix)) return true;
  return /^[A-Z0-9]/.test(key.charAt(prefix.length)) && prefix.length >= 3;
};

const isUsed = (namespace: string, key: string, code: CodeIndex): boolean => {
  // `t('summary', { count })` resolves to `summary_one` / `summary_other`.
  if (PLURAL_FORM.test(key)) return isUsed(namespace, key.replace(PLURAL_FORM, ''), code);
  const qualified = `${namespace}:${key}`;
  if (CATALAN_ONLY_KEYS.has(qualified)) return true;
  if (code.literals.has(key) || code.literals.has(qualified)) return true;
  if (code.anyNamespaceKeys.has(key)) return true;
  return code.prefixes.some((prefix) => coversKey(prefix, key) || coversKey(prefix, qualified));
};

export const orphanKeys = (locales: Locales, code: CodeIndex): string[] => {
  const orphans: string[] = [];
  for (const [namespace, keys] of locales.get('ca') ?? new Map()) {
    for (const key of keys.keys()) {
      if (!isUsed(namespace, key, code)) orphans.push(`${namespace}:${key}`);
    }
  }
  return orphans;
};

export const missingKeys = (locales: Locales, code: CodeIndex): string[] => {
  const reference = locales.get('ca') ?? new Map();
  const missing: string[] = [];
  for (const literal of code.literals) {
    const match = /^([a-z][a-z-]*):([A-Za-z][\w.-]*)$/.exec(literal);
    if (match === null) continue;
    const [, namespace = '', key = ''] = match;
    const keys = reference.get(namespace);
    if (keys === undefined) continue;
    const isBranch = [...keys.keys()].some((k) => k.startsWith(`${key}.`));
    if (!keys.has(key) && !isBranch) missing.push(literal);
  }
  return missing.sort();
};

// The namespace name comes from the `resources` map in create-i18n.ts
// (`player-services.json` is registered as `playerServices`).
const namespaceNames = (root: string): ReadonlyMap<string, string> => {
  const source = readFileSync(resolve(root, 'packages/shared/i18n/create-i18n.ts'), 'utf8');
  const fileOf = new Map<string, string>();
  for (const [, variable = '', file = ''] of source.matchAll(
    /import (ca\w+) from '\.\/locales\/ca\/([\w-]+)\.json';/g,
  )) {
    fileOf.set(variable, file);
  }
  const names = new Map<string, string>();
  for (const [, name = '', variable = ''] of source.matchAll(/^\s+'?([\w-]+)'?: (ca\w+),$/gm)) {
    const file = fileOf.get(variable);
    if (file !== undefined) names.set(file, name);
  }
  return names;
};

const loadLocales = (root: string): Locales => {
  const names = namespaceNames(root);
  const locales = new Map<string, Map<string, Map<string, string>>>();
  for (const path of new Glob('packages/shared/i18n/locales/*/*.json').scanSync({ cwd: root })) {
    const [, language = '', file = ''] = /locales\/([a-z]+)\/(.+)\.json$/.exec(path) ?? [];
    const catalog = JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Catalog;
    if (!locales.has(language)) locales.set(language, new Map());
    locales.get(language)?.set(names.get(file) ?? file, flatten(catalog));
  }
  return locales;
};

// Bun's Glob takes no slashes inside `{}` alternatives, so each root is its own pattern.
const CODE_PATTERNS = [
  'apps/*/src/**/*.{ts,tsx}',
  'packages/shared/**/*.{ts,tsx}',
  'supabase/functions/**/*.ts',
  'workers/*/src/**/*.ts',
];

const loadCode = (root: string): string[] => {
  const files = CODE_PATTERNS.flatMap((pattern) => [...new Glob(pattern).scanSync({ cwd: root })]);
  return files
    .filter((path) => !/node_modules|\.(test|case)\.tsx?$|\.web-qa\.ts$/.test(path))
    .map((path) => readFileSync(resolve(root, path), 'utf8'));
};

if (import.meta.main) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const locales = loadLocales(root);
  const code = indexCode(loadCode(root));
  const report = {
    parity: parityProblems(locales),
    missing: missingKeys(locales, code),
    orphans: orphanKeys(locales, code),
  };
  const total = report.parity.length + report.missing.length + report.orphans.length;
  if (total > 0) {
    for (const [kind, lines] of Object.entries(report)) {
      if (lines.length > 0) console.error(`${kind} (${lines.length}):\n  ${lines.join('\n  ')}`);
    }
    process.exit(1);
  }
  console.log('Translation keys: parity, references and usage all pass.');
}

/**
 * Locale-aware selectors, taken from the app's own translation files (RAPP-78).
 *
 * A capture drives the UI by the text a user sees, and this app renders that
 * text in five languages. Copying "Inici" into a Maestro flow would break the
 * moment the AR pass ran, and would silently rot the moment a translation
 * changed. So a flow declares WHICH key it is looking for and the harness
 * resolves it against `packages/shared/i18n/locales/<locale>/<namespace>.json`,
 * which is the same file the app renders from.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot, type Locale } from './config';

const localesDir = path.join(repoRoot, 'packages', 'shared', 'i18n', 'locales');

export type Translator = (key: string) => string;

/** Resolves `namespace:dotted.path` against one locale's catalogs. */
export async function loadTranslator(locale: Locale): Promise<Translator> {
  const dir = path.join(localesDir, locale);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
  const catalogs = new Map<string, unknown>();
  for (const file of files) {
    catalogs.set(path.basename(file, '.json'), await Bun.file(path.join(dir, file)).json());
  }

  return (key: string): string => {
    const separator = key.indexOf(':');
    if (separator === -1) {
      throw new Error(`Translation key "${key}" must be written as "namespace:dotted.path"`);
    }
    const namespace = key.slice(0, separator);
    if (!catalogs.has(namespace)) {
      throw new Error(`No "${namespace}" catalog for locale "${locale}" in ${dir}`);
    }
    const value = key
      .slice(separator + 1)
      .split('.')
      .reduce<unknown>(
        (node, segment) =>
          typeof node === 'object' && node !== null
            ? (node as Record<string, unknown>)[segment]
            : undefined,
        catalogs.get(namespace),
      );
    if (typeof value !== 'string') {
      throw new Error(`Translation "${key}" is missing from the ${locale} catalog`);
    }
    return value;
  };
}

/** Replaces every `{{namespace:key}}` token in a JSON-shaped value. */
export function interpolate<T>(value: T, translate: Translator): T {
  if (typeof value === 'string') {
    return value.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => translate(key.trim())) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => interpolate(item, translate)) as T;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolate(item, translate)]),
    ) as T;
  }
  return value;
}

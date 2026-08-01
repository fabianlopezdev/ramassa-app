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
  return loadTranslatorForLocale(locale, locale === 'ca' ? 'ar' : 'ca');
}

/**
 * `other:<namespace>:<key>` resolves against the OPPOSITE locale. A flow that
 * switches the app's language mid-run needs it: from the tap onward the whole
 * UI speaks the other language, so every selector resolved for this pass stops
 * matching, and the buttons that dismiss the prompt or sign out are the first
 * casualties.
 */
async function loadTranslatorForLocale(locale: Locale, otherLocale: Locale): Promise<Translator> {
  const dir = path.join(localesDir, locale);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
  const catalogs = new Map<string, unknown>();
  for (const file of files) {
    catalogs.set(path.basename(file, '.json'), await Bun.file(path.join(dir, file)).json());
  }

  // Country names live in the generated shared list, not in the locale
  // catalogs, so the picker chips get their own virtual namespace:
  // `{{country:SY}}` resolves to the same localized label the app renders.
  const countries = (await Bun.file(
    path.join(repoRoot, 'packages', 'shared', 'i18n', 'countries.json'),
  ).json()) as readonly { code: string; names: Record<string, string> }[];

  const otherDir = path.join(localesDir, otherLocale);
  const otherCatalogs = new Map<string, unknown>();
  for (const file of (await readdir(otherDir)).filter((name) => name.endsWith('.json'))) {
    otherCatalogs.set(
      path.basename(file, '.json'),
      await Bun.file(path.join(otherDir, file)).json(),
    );
  }

  const resolve = (
    key: string,
    catalogsToUse: Map<string, unknown>,
    activeLocale: Locale,
  ): string => {
    const separator = key.indexOf(':');
    if (separator === -1) {
      throw new Error(`Translation key "${key}" must be written as "namespace:dotted.path"`);
    }
    const namespace = key.slice(0, separator);
    // The language a capture pass SWITCHES to, which must read in the other
    // direction so the restart prompt is what gets photographed. Computed here
    // rather than stored as a product string: "the other language" is a
    // property of the capture, not something the app ever says.
    if (key === 'language:otherNativeName') {
      return activeLocale === 'ca' ? 'العربية' : 'Català';
    }
    if (namespace === 'country') {
      const code = key.slice(separator + 1);
      const name = countries.find((entry) => entry.code === code)?.names[locale];
      if (name === undefined) {
        throw new Error(`No "${locale}" country name for code "${code}" in countries.json`);
      }
      return name;
    }
    if (!catalogsToUse.has(namespace)) {
      throw new Error(`No "${namespace}" catalog for locale "${activeLocale}"`);
    }
    const value = key
      .slice(separator + 1)
      .split('.')
      .reduce<unknown>(
        (node, segment) =>
          typeof node === 'object' && node !== null
            ? (node as Record<string, unknown>)[segment]
            : undefined,
        catalogsToUse.get(namespace),
      );
    if (typeof value !== 'string') {
      throw new Error(`Translation "${key}" is missing from the ${activeLocale} catalog`);
    }
    return value;
  };

  return (key: string): string =>
    key.startsWith('other:')
      ? resolve(key.slice('other:'.length), otherCatalogs, otherLocale)
      : resolve(key, catalogs, locale);
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

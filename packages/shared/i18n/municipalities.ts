/**
 * Generated IDESCAT municipality options (RAPP-100).
 *
 * The official Catalan toponym is the canonical stored value. Labels come
 * from IDESCAT for its supported app locales; Arabic and Farsi deliberately
 * retain that official toponym because IDESCAT publishes no translation for
 * those languages. The surrounding picker copy remains fully localized.
 */

import { languageCodeSchema, type LanguageCode } from '../schemas/language';
import municipalitiesData from './municipalities.json';

const SUPPORTED_LANGUAGES = languageCodeSchema.options;
type SupportedLanguage = LanguageCode;

export interface MunicipalityOption {
  readonly code: string;
  readonly comarcaCode: string;
  readonly label: string;
  readonly canonical: string;
}

interface MunicipalityEntry {
  readonly code: string;
  readonly comarcaCode: string;
  readonly names: Record<SupportedLanguage, string>;
}

interface MunicipalityData {
  readonly provenance: {
    readonly publisher: string;
    readonly sourceUrl: string;
    readonly apiVersion: string;
    readonly retrievedAt: string;
    readonly sourceLocales: readonly string[];
    readonly fallbackLocales: readonly string[];
  };
  readonly municipalities: readonly MunicipalityEntry[];
}

const DATA = municipalitiesData as MunicipalityData;
const MUNICIPALITIES = DATA.municipalities;
const COMBINING_MARKS = /[\u0300-\u036f]/g;

function normalizeForSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '');
}

const NORMALIZED_SEARCH_TEXT_BY_CODE = new Map(
  MUNICIPALITIES.map((entry) => [
    entry.code,
    Object.values(entry.names).map(normalizeForSearch).join('\n'),
  ]),
);
const MUNICIPALITY_BY_CANONICAL = new Map(MUNICIPALITIES.map((entry) => [entry.names.ca, entry]));
const MUNICIPALITY_COLLATOR_BY_LOCALE = new Map(
  SUPPORTED_LANGUAGES.map((locale) => [locale, new Intl.Collator(locale)]),
);
const MUNICIPALITY_OPTIONS_BY_LOCALE = new Map<SupportedLanguage, readonly MunicipalityOption[]>();

export const MUNICIPALITY_DATA_PROVENANCE = DATA.provenance;

/** The four Osona values already represented in the seeded participant roster. */
export const COMMON_MUNICIPALITY_CODES: readonly string[] = [
  '082981',
  '081120',
  '082858',
  '081831',
];

export function getMunicipalityOptions(locale: SupportedLanguage): readonly MunicipalityOption[] {
  const cached = MUNICIPALITY_OPTIONS_BY_LOCALE.get(locale);
  if (cached !== undefined) return cached;

  const collator = MUNICIPALITY_COLLATOR_BY_LOCALE.get(locale);
  if (collator === undefined) return [];

  const options = MUNICIPALITIES.map((entry) => ({
    code: entry.code,
    comarcaCode: entry.comarcaCode,
    label: entry.names[locale],
    canonical: entry.names.ca,
  })).sort((first, second) => collator.compare(first.label, second.label));
  MUNICIPALITY_OPTIONS_BY_LOCALE.set(locale, options);
  return options;
}

export function searchMunicipalities(
  options: readonly MunicipalityOption[],
  query: string,
): readonly MunicipalityOption[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === '') return options;
  return options.filter((option) =>
    NORMALIZED_SEARCH_TEXT_BY_CODE.get(option.code)?.includes(needle),
  );
}

export function municipalityLabelForCanonical(
  canonical: string,
  locale: SupportedLanguage,
): string | null {
  return MUNICIPALITY_BY_CANONICAL.get(canonical)?.names[locale] ?? null;
}

export function isCanonicalMunicipality(value: string): boolean {
  return MUNICIPALITY_BY_CANONICAL.has(value);
}

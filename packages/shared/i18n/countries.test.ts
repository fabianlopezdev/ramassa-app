/**
 * The nationality picker's data contract (RAPP-21). What these defend:
 * the canonical value is IDENTICAL from every locale (aggregate reporting
 * depends on it), the seeded roster's nationalities resolve to the same
 * canonical strings the seeds already use, and search works across scripts
 * and without accents.
 */

import { describe, expect, test } from 'bun:test';
import {
  COMMON_COUNTRY_CODES,
  countryLabelForCanonical,
  getCountryOptions,
  searchCountries,
} from './countries';

describe('country options', () => {
  test('every locale saves the SAME canonical value for the same country', () => {
    const canonicalByLocale = (['ca', 'es', 'en', 'ar', 'fa'] as const).map(
      (locale) => getCountryOptions(locale).find((option) => option.code === 'SY')?.canonical,
    );
    expect(new Set(canonicalByLocale).size).toBe(1);
    expect(canonicalByLocale[0]).toBe('Síria');
  });

  test('canonical names match the seeded roster exactly', () => {
    const options = getCountryOptions('ca');
    const canonical = new Map(options.map((option) => [option.code, option.canonical]));
    expect(canonical.get('SY')).toBe('Síria');
    expect(canonical.get('UA')).toBe('Ucraïna');
    expect(canonical.get('AF')).toBe('Afganistan');
    expect(canonical.get('ES')).toBe('Espanya');
    expect(canonical.get('VE')).toBe('Veneçuela');
  });

  test('labels are localized: an Arabic reader sees Arabic', () => {
    const arabic = getCountryOptions('ar').find((option) => option.code === 'SY');
    expect(arabic?.label).toBe('سوريا');
    expect(arabic?.canonical).toBe('Síria');
  });

  test('the pinned commons exist in the list', () => {
    const codes = new Set(getCountryOptions('ca').map((option) => option.code));
    for (const code of COMMON_COUNTRY_CODES) {
      expect(codes.has(code)).toBe(true);
    }
  });
});

describe('searchCountries', () => {
  test('accent-insensitive: "siria" finds Síria', () => {
    const options = getCountryOptions('ca');
    const hits = searchCountries(options, 'siria');
    expect(hits.some((option) => option.code === 'SY')).toBe(true);
  });

  test('cross-script: Latin "ukr" finds the country while the app is in Arabic', () => {
    const options = getCountryOptions('ar');
    const hits = searchCountries(options, 'ukr');
    expect(hits.some((option) => option.code === 'UA')).toBe(true);
  });

  test('an empty query returns everything', () => {
    const options = getCountryOptions('en');
    expect(searchCountries(options, '  ').length).toBe(options.length);
  });
});

describe('countryLabelForCanonical', () => {
  test('re-displays a stored canonical in the current locale', () => {
    expect(countryLabelForCanonical('Síria', 'ar')).toBe('سوريا');
    expect(countryLabelForCanonical('Síria', 'en')).toBe('Syria');
    expect(countryLabelForCanonical('Atlantis', 'ca')).toBeNull();
  });
});

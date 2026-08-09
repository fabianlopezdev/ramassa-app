/**
 * IDESCAT municipality data contract (RAPP-100).
 *
 * The generated snapshot is the product boundary: every supported locale must
 * see a label for all 947 official municipalities while saving one Catalan
 * canonical value for aggregate reporting.
 */

import { describe, expect, test } from 'bun:test';
import {
  COMMON_MUNICIPALITY_CODES,
  getMunicipalityOptions,
  MUNICIPALITY_DATA_PROVENANCE,
  municipalityLabelForCanonical,
  searchMunicipalities,
} from '@ramassa/shared/i18n/municipalities';

describe('municipality options', () => {
  test('loads the complete IDESCAT register with recorded source provenance', () => {
    const options = getMunicipalityOptions('ca');

    expect(options).toHaveLength(947);
    expect(MUNICIPALITY_DATA_PROVENANCE.publisher).toBe(
      "Institut d'Estadística de Catalunya (IDESCAT)",
    );
    expect(MUNICIPALITY_DATA_PROVENANCE.sourceUrl).toBe(
      'https://api.idescat.cat/emex/v1/nodes.json',
    );
    expect(MUNICIPALITY_DATA_PROVENANCE.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('every locale saves the same canonical value and can redisplay it', () => {
    const locales = ['ca', 'es', 'en', 'ar', 'fa'] as const;
    const canonicalByLocale = locales.map(
      (locale) =>
        getMunicipalityOptions(locale).find((option) => option.code === '082981')?.canonical,
    );

    expect(new Set(canonicalByLocale)).toEqual(new Set(['Vic']));
    for (const locale of locales) {
      expect(municipalityLabelForCanonical('Vic', locale)).toBe(
        getMunicipalityOptions(locale).find((option) => option.code === '082981')?.label ?? null,
      );
    }
  });

  test('the seeded Osona municipalities are available as pinned one-tap answers', () => {
    const byCode = new Map(getMunicipalityOptions('ca').map((option) => [option.code, option]));
    const common = COMMON_MUNICIPALITY_CODES.map((code) => byCode.get(code));

    expect(common.map((option) => option?.canonical)).toEqual([
      'Vic',
      'Manlleu',
      'Torelló',
      'Roda de Ter',
    ]);
    expect(common.every((option) => option?.comarcaCode === '24')).toBe(true);
  });
});

describe('searchMunicipalities', () => {
  test('finds an official toponym without requiring its accent', () => {
    const hits = searchMunicipalities(getMunicipalityOptions('ca'), 'torello');

    expect(hits.map((option) => option.canonical)).toContain('Torelló');
  });
});

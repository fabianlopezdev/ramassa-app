// Generates the localized country list the onboarding nationality picker uses
// (RAPP-21). Run with: node scripts/generate-country-names.mjs
//
// The RAPP-4 intake contract specifies "country picker (ISO list, localized
// names)": nationality feeds aggregate impact reporting, so free text - where
// one country arrives as Ucraïna, Ucrania, Ukraine and a typo - would destroy
// the one thing the field exists for.
//
// Names come from Node's ICU (Intl.DisplayNames), not from anyone's typing,
// and the output is committed so the app bundles no ICU data and the list is
// identical on every platform. Codes are discovered by probing every AA-ZZ
// pair and keeping what ICU recognizes, minus the non-country regions ICU
// also names (EU, UN, world zones): a hand-maintained code list would just be
// a second thing to drift.

import fs from 'node:fs';
import path from 'node:path';

const LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'];

// ICU names these, but they are not countries a person is a national of.
const NON_COUNTRY_REGIONS = new Set([
  'AC',
  'BV',
  'CP',
  'DG',
  'EA',
  'EU',
  'EZ',
  'HM',
  'IC',
  'QO',
  'TA',
  'UN',
  'XA',
  'XB',
  'ZZ',
]);

const displayNames = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, new Intl.DisplayNames([lang], { type: 'region' })]),
);

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const countries = [];
for (const first of letters) {
  for (const second of letters) {
    const code = `${first}${second}`;
    if (NON_COUNTRY_REGIONS.has(code)) continue;
    const english = displayNames.en.of(code);
    if (english === undefined || english === code) continue;
    countries.push({
      code,
      names: Object.fromEntries(LANGUAGES.map((lang) => [lang, displayNames[lang].of(code)])),
    });
  }
}

countries.sort((a, b) => a.names.ca.localeCompare(b.names.ca, 'ca'));

const outPath = path.join('packages', 'shared', 'i18n', 'countries.json');
fs.writeFileSync(outPath, `${JSON.stringify(countries, null, 2)}\n`);
console.log(`wrote ${countries.length} countries to ${outPath}`);

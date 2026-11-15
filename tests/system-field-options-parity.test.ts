/**
 * The options of the app's choice fields live in two places (RAPP-660, D5):
 * the enums the apps validate with (`schemas/onboarding.ts`, `schemas/season.ts`,
 * `schemas/support-needs.ts`) and `private.system_field_options()`, which seeds
 * each option with the stored string as its key and the `onboarding`
 * translation as its label. This keeps them equal without a database: it reads
 * the block marked `system-field-options` from the newest migration that
 * defines it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';
import { YES_NO } from '@ramassa/shared/intake-builder';
import {
  APPLICANT_STATUSES,
  CLOTHING_SIZES,
  DOCUMENT_TYPES,
  SHOE_SIZES,
  SUPPORT_NEED_CATEGORIES,
  SUPPORT_NEED_LABEL_KEYS,
} from '@ramassa/shared/schemas';

const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');
const LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'] as const;

interface SeededOption {
  readonly field: string;
  readonly key: string;
  readonly label: Record<string, string>;
}

function seededOptions(): readonly SeededOption[] {
  const sql = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .filter((text) => text.includes('-- system-field-options:start'))
    .at(-1);
  expect(sql).toBeDefined();
  const block = sql!.slice(
    sql!.indexOf('-- system-field-options:start'),
    sql!.indexOf('-- system-field-options:end'),
  );
  return [...block.matchAll(/\('([a-z_]+)', '([A-Za-z0-9_]+)', '(\{.*?\})'::jsonb, \d+\)/g)].map(
    ([, field, key, label]) => ({
      field: field!,
      key: key!,
      label: JSON.parse(label!.replaceAll("''", "'")) as Record<string, string>,
    }),
  );
}

const onboarding = Object.fromEntries(
  LANGUAGES.map((language) => [
    language,
    JSON.parse(
      readFileSync(
        resolve(import.meta.dir, `../packages/shared/i18n/locales/${language}/onboarding.json`),
        'utf8',
      ),
    ) as Record<string, string>,
  ]),
);

const keysOf = (field: string) =>
  seededOptions()
    .filter((option) => option.field === field)
    .map((option) => option.key);

test('each choice field has the options the app stores, in its order', () => {
  expect(keysOf('document_type')).toEqual([...DOCUMENT_TYPES]);
  expect(keysOf('has_dependents')).toEqual([...YES_NO]);
  expect(keysOf('clothing_size')).toEqual([...CLOTHING_SIZES]);
  expect(keysOf('shoe_size')).toEqual([...SHOE_SIZES]);
  expect(keysOf('applicant_status')).toEqual([...APPLICANT_STATUSES]);
  expect(keysOf('specific_needs')).toEqual([...SUPPORT_NEED_CATEGORIES, 'none']);
});

const LABEL_KEYS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  document_type: {
    nie: 'documentTypeNie',
    passport: 'documentTypePassport',
    other: 'documentTypeOther',
    none: 'documentTypeNone',
  },
  has_dependents: { yes: 'yesOption', no: 'noOption' },
  applicant_status: {
    asylum_seeker: 'applicantStatusAsylumSeeker',
    refugee: 'applicantStatusRefugee',
    migrant: 'applicantStatusMigrant',
    other: 'applicantStatusOther',
    prefer_not_to_say: 'applicantStatusPreferNotToSay',
  },
  specific_needs: Object.fromEntries(
    Object.entries(SUPPORT_NEED_LABEL_KEYS).map(([key, label]) => [
      key,
      label.replace('onboarding:', ''),
    ]),
  ),
};

test('each option reads as her phone says it, in every language', () => {
  const translated = seededOptions().filter((option) => LABEL_KEYS[option.field] !== undefined);
  expect(translated.length).toBe(17);
  for (const option of translated) {
    const key = LABEL_KEYS[option.field]![option.key]!;
    expect(option.label).toEqual(
      Object.fromEntries(LANGUAGES.map((language) => [language, onboarding[language]![key]!])),
    );
  }
});

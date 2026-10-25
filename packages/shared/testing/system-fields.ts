/**
 * The app's fields as `intake_catalog` sends them (RAPP-661), for unit tests
 * of the code that reads and writes her answers by field. Ids are made up and
 * stable; each choice field carries the option keys the app stores.
 */
import { AppError } from '../errors';
import { SYSTEM_FIELD_QUESTIONS, type SystemFieldKey } from '../onboarding/system-fields';

const CHOICES: Partial<Record<SystemFieldKey, readonly string[]>> = {
  document_type: ['nie', 'passport', 'other', 'none'],
  has_dependents: ['yes', 'no'],
  clothing_size: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  shoe_size: ['37', '38', '39', '40'],
  applicant_status: ['asylum_seeker', 'refugee', 'migrant', 'other', 'prefer_not_to_say'],
  specific_needs: ['accessibility', 'health', 'communication', 'wellbeing', 'other', 'none'],
};

const TYPES: Partial<Record<SystemFieldKey, string>> = {
  date_of_birth: 'date',
  nationality: 'country',
  city: 'municipality',
  phone: 'phone',
  num_dependents: 'number',
  supporting_entities: 'item_list',
  childcare_need: 'yes_no_maybe',
  specific_needs: 'multiple_choice',
  applicant_status_details: 'long_text',
  specific_needs_details: 'long_text',
};

/** Each app field's level as the seeded layout has it (`private.system_profile_fields()`). */
const NORMAL: readonly SystemFieldKey[] = [
  'first_name',
  'last_name',
  'reference_entity',
  'clothing_size',
  'shoe_size',
];
const SENSITIVE: readonly SystemFieldKey[] = [
  'document_number',
  'phone',
  'address',
  'postal_code',
  'applicant_status',
  'applicant_status_details',
  'specific_needs',
  'specific_needs_details',
];
const privacyOf = (key: SystemFieldKey) =>
  NORMAL.includes(key) ? 'normal' : SENSITIVE.includes(key) ? 'sensitive' : 'personal';

const KEYS = Object.keys(SYSTEM_FIELD_QUESTIONS) as SystemFieldKey[];

const pad = (n: number) => String(n).padStart(12, '0');

/** The made-up id of an app field in the fixture. */
export function systemFieldFixtureId(key: SystemFieldKey): string {
  return `00000000-0000-4000-8661-${pad(KEYS.indexOf(key) + 1)}`;
}

/** The made-up id of a keyed option of an app field in the fixture. */
export function systemOptionFixtureId(key: SystemFieldKey, option: string): string {
  const index = (CHOICES[key] ?? []).indexOf(option);
  if (index < 0) throw new AppError('VALIDATION-1', { message: `${key} has no option ${option}` });
  return `00000000-0000-4000-8662-${pad((KEYS.indexOf(key) + 1) * 100 + index)}`;
}

/** `intake_catalog`'s `fields`, the app's fields only. */
export function systemFieldsCatalogFixture(): { readonly fields: readonly unknown[] } {
  return {
    fields: KEYS.map((key) => ({
      id: systemFieldFixtureId(key),
      system_key: key,
      question_type: TYPES[key] ?? (CHOICES[key] === undefined ? 'short_text' : 'single_choice'),
      privacy: privacyOf(key),
      options: (CHOICES[key] ?? []).map((option, index) => ({
        id: systemOptionFixtureId(key, option),
        key: option,
        label: { ca: option },
        sort_order: index,
        is_archived: false,
      })),
    })),
  };
}

/**
 * Her answers by field id, as the readers return them since RAPP-662, from
 * values by system key: a choice is given by its option's key (`nie`, `M`)
 * and stored as that option's fixture id.
 */
export function systemAnswersFixture(
  values: Readonly<Partial<Record<SystemFieldKey, string | number | readonly string[]>>>,
): Record<string, unknown> {
  return Object.fromEntries(
    (Object.entries(values) as [SystemFieldKey, string | number | readonly string[]][]).map(
      ([key, value]) => {
        if (CHOICES[key] === undefined) return [systemFieldFixtureId(key), value];
        const ids = (Array.isArray(value) ? value : [value]).map((option) =>
          systemOptionFixtureId(key, String(option)),
        );
        return [systemFieldFixtureId(key), TYPES[key] === 'multiple_choice' ? ids : ids[0]];
      },
    ),
  );
}

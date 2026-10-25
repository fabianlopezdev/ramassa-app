/**
 * The app's own fields by their system key (RAPP-660, D1), each with the app
 * question it belongs to. A question that was composite (the document, the
 * dependents, the applicant status, the specific needs) has several fields.
 *
 * The database keeps the same list in `private.system_profile_fields()`;
 * `tests/system-field-questions-parity.test.ts` keeps the two equal.
 */
import type { IntakeQuestion } from './intake';

export const SYSTEM_FIELD_QUESTIONS = {
  first_name: 'first_name',
  last_name: 'last_name',
  date_of_birth: 'date_of_birth',
  place_of_birth: 'place_of_birth',
  nationality: 'nationality',
  document_type: 'document',
  document_number: 'document',
  document_name: 'document',
  phone: 'phone',
  address: 'address',
  city: 'city',
  postal_code: 'postal_code',
  reference_entity: 'reference_entity',
  reference_contact_name: 'reference_contact_name',
  has_dependents: 'dependents',
  num_dependents: 'dependents',
  clothing_size: 'clothing_size',
  shoe_size: 'shoe_size',
  applicant_status: 'applicant_status',
  applicant_status_details: 'applicant_status',
  supporting_entities: 'supporting_entities',
  childcare_need: 'childcare_need',
  specific_needs: 'specific_needs',
  specific_needs_details: 'specific_needs',
} as const satisfies Readonly<Record<string, IntakeQuestion>>;

export type SystemFieldKey = keyof typeof SYSTEM_FIELD_QUESTIONS;

/** Her names stay on her account (D2): they are never field answers. */
export const ACCOUNT_NAME_KEYS = ['first_name', 'last_name'] as const;

export function isSystemFieldKey(key: string): key is SystemFieldKey {
  return Object.prototype.hasOwnProperty.call(SYSTEM_FIELD_QUESTIONS, key);
}

/**
 * The app questions with no field: her account settings (D2). Her language
 * and photo stay on her account; her season count is a number of seasons.
 */
const ACCOUNT_SETTING_KEYS: Partial<Readonly<Record<IntakeQuestion, string>>> = {
  preferred_language: 'preferred_language',
  avatar: 'avatar_url',
  season_number: 'season_number',
};

/**
 * Where an app question travels in the apps' column payloads, until they send
 * answers by field themselves (RAPP-663, RAPP-664): the system keys of its
 * fields (a composite question has several), or the account setting.
 */
export function questionPayloadKeys(question: IntakeQuestion): readonly string[] {
  const setting = ACCOUNT_SETTING_KEYS[question];
  return setting === undefined ? systemKeysOfQuestion(question) : [setting];
}

/** The system keys of one app question's fields, in the catalog's order. */
export function systemKeysOfQuestion(question: IntakeQuestion): readonly SystemFieldKey[] {
  return (Object.keys(SYSTEM_FIELD_QUESTIONS) as SystemFieldKey[]).filter(
    (key) => SYSTEM_FIELD_QUESTIONS[key] === question,
  );
}

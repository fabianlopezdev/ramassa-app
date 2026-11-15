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

/**
 * Her names keep the app's own name control: her phone asks them as text and
 * the database stores the text as her answers, fitted to their type (RAPP-693).
 */
export const ACCOUNT_NAME_KEYS = ['first_name', 'last_name'] as const;

export function isSystemFieldKey(key: string): key is SystemFieldKey {
  return Object.prototype.hasOwnProperty.call(SYSTEM_FIELD_QUESTIONS, key);
}

/** The system keys of one app question's fields, in the catalog's order. */
export function systemKeysOfQuestion(question: IntakeQuestion): readonly SystemFieldKey[] {
  return (Object.keys(SYSTEM_FIELD_QUESTIONS) as SystemFieldKey[]).filter(
    (key) => SYSTEM_FIELD_QUESTIONS[key] === question,
  );
}

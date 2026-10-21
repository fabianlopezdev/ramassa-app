/**
 * The built-in wizard questions as staff read them on the dashboard: the
 * wizard's own label for each (RAPP-301), and the fixed options staff may
 * relabel or hide in the question builder (RAPP-307). Questions answered from
 * a long list (countries, municipalities, sizes) offer no option changes.
 */
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import type { IntakeQuestion } from '@ramassa/shared/intake';
import { APPLICANT_STATUSES, CHILDCARE_NEEDS, DOCUMENT_TYPES } from '@ramassa/shared/schemas';

/** The wizard's own question labels, so staff read what she reads (shared with the phone, RAPP-618). */
export { INTAKE_QUESTION_LABEL_KEYS as QUESTION_LABEL_KEYS } from '@ramassa/shared/intake';

const DOCUMENT_TYPE_KEYS = {
  nie: 'onboarding:documentTypeNie',
  passport: 'onboarding:documentTypePassport',
  other: 'onboarding:documentTypeOther',
  none: 'onboarding:documentTypeNone',
} as const;

const APPLICANT_STATUS_KEYS = {
  asylum_seeker: 'onboarding:applicantStatusAsylumSeeker',
  refugee: 'onboarding:applicantStatusRefugee',
  migrant: 'onboarding:applicantStatusMigrant',
  other: 'onboarding:applicantStatusOther',
  prefer_not_to_say: 'onboarding:applicantStatusPreferNotToSay',
} as const;

const CHILDCARE_NEED_KEYS = {
  yes: 'onboarding:childcareNeedYes',
  no: 'onboarding:childcareNeedNo',
  maybe: 'onboarding:childcareNeedMaybe',
} as const;

/** The fixed options of each built-in choice question, as label keys or plain names. */
export function builtinQuestionOptions(
  question: IntakeQuestion,
  t: (key: string) => string,
): readonly { readonly value: string; readonly label: string }[] {
  switch (question) {
    case 'document':
      return DOCUMENT_TYPES.map((value) => ({ value, label: t(DOCUMENT_TYPE_KEYS[value]) }));
    case 'applicant_status':
      return APPLICANT_STATUSES.map((value) => ({ value, label: t(APPLICANT_STATUS_KEYS[value]) }));
    case 'childcare_need':
      return CHILDCARE_NEEDS.map((value) => ({ value, label: t(CHILDCARE_NEED_KEYS[value]) }));
    case 'preferred_language':
      return SUPPORTED_LANGUAGES.map((value) => ({ value, label: LANGUAGE_NATIVE_NAMES[value] }));
    default:
      return [];
  }
}

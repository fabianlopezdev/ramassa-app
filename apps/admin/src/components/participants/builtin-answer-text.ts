/**
 * Her answer to one of the app's own fields, in words (RAPP-24, RAPP-653).
 *
 * The labels are the onboarding's and the profile's, the words she reads on
 * her own phone: a staff member and a participant on the same call should be
 * looking at the same words. An absent value reads as "not provided", never
 * as a blank, because a blank looks like a field that failed to load.
 *
 * For a woman who has not joined, a value counts only when somebody answered
 * it (RAPP-300): her stored defaults are not answers.
 */

import type { TFunction } from 'i18next';
import type { AnsweredQuestions, IntakeQuestion } from '@ramassa/shared/intake';
import { dependentsShown, type ParticipantDetailRow } from '@ramassa/shared/participants';
import { formatSupportNeeds } from '@ramassa/shared/schemas';

const APPLICANT_STATUS_KEYS: Readonly<Record<string, string>> = {
  asylum_seeker: 'onboarding:applicantStatusAsylumSeeker',
  refugee: 'onboarding:applicantStatusRefugee',
  migrant: 'onboarding:applicantStatusMigrant',
  other: 'onboarding:applicantStatusOther',
  prefer_not_to_say: 'onboarding:applicantStatusPreferNotToSay',
};

const CHILDCARE_KEYS: Readonly<Record<string, string>> = {
  yes: 'onboarding:childcareNeedYes',
  no: 'onboarding:childcareNeedNo',
  maybe: 'onboarding:childcareNeedMaybe',
};

const DOCUMENT_TYPE_KEYS: Readonly<Record<string, string>> = {
  nie: 'onboarding:documentTypeNie',
  passport: 'onboarding:documentTypePassport',
  other: 'onboarding:documentTypeOther',
  none: 'onboarding:documentTypeNone',
};

/** Her answer to an app field, or null when nobody gave one. */
export function builtinAnswerText(
  question: IntakeQuestion,
  participant: ParticipantDetailRow,
  t: TFunction,
  locale: string,
): string | null {
  const text = (value: string | null | undefined) =>
    value === null || value === undefined || value.trim() === '' ? null : value;
  switch (question) {
    case 'first_name':
      return text(participant.first_name);
    case 'last_name':
      return text(participant.last_name);
    case 'date_of_birth':
      return participant.date_of_birth === null
        ? null
        : new Date(participant.date_of_birth).toLocaleDateString(locale, { timeZone: 'UTC' });
    case 'place_of_birth':
      return text(participant.place_of_birth);
    case 'nationality':
      return text(participant.nationality);
    case 'preferred_language':
      return t(`common:languageName.${participant.preferred_language}`);
    case 'document': {
      const type = participant.document_type;
      if (type === null) return null;
      const name =
        type === 'other' && participant.document_name
          ? participant.document_name
          : t(DOCUMENT_TYPE_KEYS[type] ?? 'profile:notProvided');
      return participant.document_number ? `${name} · ${participant.document_number}` : name;
    }
    case 'phone':
      return text(participant.phone);
    case 'address':
      return text(participant.address);
    case 'city':
      return text(participant.city);
    case 'postal_code':
      return text(participant.postal_code);
    case 'reference_entity':
      return text(participant.reference_entity);
    case 'reference_contact_name':
      return text(participant.reference_contact_name);
    case 'dependents': {
      // Unknown is not "no" (RAPP-611).
      const shown = dependentsShown(participant.has_dependents, participant.num_dependents);
      return shown.kind === 'count'
        ? String(shown.count)
        : shown.kind === 'none'
          ? t('onboarding:noOption')
          : null;
    }
    case 'clothing_size':
      return text(participant.clothing_size);
    case 'shoe_size':
      return text(participant.shoe_size);
    case 'applicant_status':
      return participant.applicant_status == null
        ? null
        : t(APPLICANT_STATUS_KEYS[participant.applicant_status] ?? 'profile:notProvided');
    case 'supporting_entities':
      return text(participant.supporting_entities?.join(', '));
    case 'season_number':
      return participant.season_number == null
        ? null
        : t(`onboarding:seasonNumber${participant.season_number}`);
    case 'childcare_need':
      return participant.childcare_need == null
        ? null
        : t(CHILDCARE_KEYS[participant.childcare_need] ?? 'profile:notProvided');
    case 'specific_needs':
      return text(formatSupportNeeds(participant.specific_needs, t));
    default:
      return null;
  }
}

/** As `builtinAnswerText`, only what somebody answered for a woman who has not joined. */
export function shownBuiltinAnswer(
  question: IntakeQuestion,
  participant: ParticipantDetailRow,
  answered: AnsweredQuestions | null,
  t: TFunction,
  locale: string,
): string | null {
  if (answered !== null && !answered.has(question)) return null;
  return builtinAnswerText(question, participant, t, locale);
}

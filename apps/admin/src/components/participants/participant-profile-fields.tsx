/**
 * A participant's record as staff read it (RAPP-24).
 *
 * The labels come from the ONBOARDING and PROFILE catalogues, the same keys the
 * player app uses on her own profile. That is not laziness: when a staff member
 * and a participant are looking at the same field from two ends of a phone call,
 * they should be looking at the same words. New admin-only wording here would be
 * a second vocabulary for one form.
 *
 * The exception is the handful of strings written in HER voice. Her profile
 * says "I appear in community photos" and "you accepted the terms on ...";
 * reused here they read as the staff member talking about herself, or as the
 * screen addressing the wrong person. Those have staff-voiced twins and nothing
 * else does: a field NAME is shared, a SENTENCE about someone is not.
 *
 * The four decrypted fields (document number, phone, address, postal code) are
 * on this screen because the team genuinely needs them, and reading them is
 * AUDITED: `get_participant_profile` wrote a row naming this staff member and
 * this moment before these values existed in the browser. The screen says so
 * rather than leaving it implicit, because a logged action nobody was told about
 * is a surprise, and this team's trust is the product.
 */

import { DetailField, DetailFieldList } from '@/components/detail/detail-section';
import { useTranslation } from 'react-i18next';
import type { ParticipantDetailRow } from '@ramassa/shared/participants';

export interface ParticipantProfileFieldsProps {
  readonly participant: ParticipantDetailRow;
}

export function ParticipantProfileFields({ participant }: ParticipantProfileFieldsProps) {
  const { t, i18n } = useTranslation(['participants', 'onboarding', 'profile', 'common']);
  const locale = i18n.resolvedLanguage ?? 'ca';

  /**
   * An absent value reads as "not provided", never as a blank. A blank cell is
   * indistinguishable from a field the screen failed to load, and those need
   * very different reactions from the person looking at it.
   */
  const shown = (value: string | null | undefined) =>
    value === null || value === undefined || value === '' ? t('profile:notProvided') : value;

  const shownDate = (value: string | null) =>
    value === null ? t('profile:notProvided') : new Date(value).toLocaleDateString(locale);

  return (
    <DetailFieldList>
      <DetailField label={t('onboarding:firstNameLabel')} value={participant.first_name} />
      <DetailField label={t('onboarding:lastNameLabel')} value={participant.last_name} />
      <DetailField
        label={t('onboarding:dateOfBirthLabel')}
        value={shownDate(participant.date_of_birth)}
      />
      <DetailField
        label={t('onboarding:placeOfBirthLabel')}
        value={shown(participant.place_of_birth)}
      />
      <DetailField
        label={t('onboarding:nationalityLabel')}
        value={shown(participant.nationality)}
      />
      <DetailField
        label={t('profile:languageLabel')}
        value={t(`common:languageName.${participant.preferred_language}`)}
      />

      <DetailField
        label={t('onboarding:documentTypeLabel')}
        value={documentTypeLabel(participant.document_type, t)}
      />
      <DetailField
        label={t('onboarding:documentNumberLabel')}
        value={shown(participant.document_number)}
      />
      <DetailField label={t('profile:fieldPhone')} value={shown(participant.phone)} />
      <DetailField label={t('profile:fieldAddress')} value={shown(participant.address)} />
      <DetailField label={t('profile:fieldCity')} value={shown(participant.city)} />
      <DetailField label={t('profile:fieldPostalCode')} value={shown(participant.postal_code)} />

      <DetailField
        label={t('participants:columnEntity')}
        value={shown(participant.reference_entity)}
      />
      <DetailField
        label={t('onboarding:referenceContactNameLabel')}
        value={shown(participant.reference_contact_name)}
      />
      <DetailField
        label={t('participants:columnDependents')}
        value={
          participant.has_dependents ? String(participant.num_dependents) : t('onboarding:noOption')
        }
      />
      <DetailField
        label={t('onboarding:clothingSizeLabel')}
        value={shown(participant.clothing_size)}
      />
      <DetailField label={t('onboarding:shoeSizeLabel')} value={shown(participant.shoe_size)} />
      <DetailField
        label={t('profile:fieldMediaConsent')}
        // The staff-voiced wording, not the participant's own. Her profile says
        // "I appear in community photos"; a staff screen that reuses it reads as
        // the staff member talking about herself.
        value={
          participant.media_consent
            ? t('participants:mediaConsentGranted')
            : t('participants:mediaConsentDenied')
        }
      />

      <DetailField
        label={t('onboarding:termsTitle')}
        value={
          participant.terms_accepted_at === null
            ? t('profile:notProvided')
            : t('participants:termsAcceptedOn', {
                date: new Date(participant.terms_accepted_at).toLocaleDateString(locale),
              })
        }
      />
    </DetailFieldList>
  );
}

/**
 * The document type as a word rather than a database value. `none` is a
 * first-class answer here exactly as it is in the wizard: many participants
 * genuinely hold no papers, and rendering that as an empty field would read as
 * missing data and invite someone to go looking for it.
 */
function documentTypeLabel(documentType: string | null, t: (key: string) => string): string {
  switch (documentType) {
    case 'nie':
      return t('onboarding:documentTypeNie');
    case 'passport':
      return t('onboarding:documentTypePassport');
    case 'other':
      return t('onboarding:documentTypeOther');
    case 'none':
      return t('onboarding:documentTypeNone');
    default:
      return t('profile:notProvided');
  }
}

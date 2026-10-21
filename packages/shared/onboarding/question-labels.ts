import type { IntakeQuestion } from './intake';

/**
 * The wizard's own label key for each question, so staff read what she reads,
 * on the dashboard and on the staff phone (RAPP-301, RAPP-618).
 */
export const INTAKE_QUESTION_LABEL_KEYS: Readonly<Partial<Record<IntakeQuestion, string>>> = {
  first_name: 'onboarding:firstNameLabel',
  last_name: 'onboarding:lastNameLabel',
  date_of_birth: 'onboarding:dateOfBirthLabel',
  place_of_birth: 'onboarding:placeOfBirthLabel',
  nationality: 'onboarding:nationalityLabel',
  preferred_language: 'onboarding:preferredLanguageLabel',
  document: 'onboarding:documentTypeLabel',
  phone: 'onboarding:phoneLabel',
  address: 'onboarding:addressLabel',
  city: 'onboarding:cityLabel',
  postal_code: 'onboarding:postalCodeLabel',
  reference_entity: 'onboarding:referenceEntityLabel',
  reference_contact_name: 'onboarding:referenceContactNameLabel',
  dependents: 'onboarding:hasDependentsLabel',
  clothing_size: 'onboarding:clothingSizeLabel',
  shoe_size: 'onboarding:shoeSizeLabel',
  applicant_status: 'onboarding:applicantStatusLabel',
  supporting_entities: 'onboarding:supportingEntitiesLabel',
  childcare_need: 'onboarding:childcareNeedLabel',
  specific_needs: 'onboarding:specificNeedsLabel',
};

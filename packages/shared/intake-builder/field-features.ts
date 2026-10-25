/**
 * The features that read one of the app's fields (RAPP-662, D7).
 *
 * A feature reads a field by its system key and understands only some answer
 * types. When staff change that field's type on Dades de les jugadores, the
 * feature reads nothing and nothing fails. The database keeps the same list in
 * `private.field_features()`; `tests/field-features-parity.test.ts` keeps the
 * two equal.
 */
import type { SystemFieldKey } from '../onboarding/system-fields';
import type { CustomQuestionType } from './question-types';

export interface FieldFeature {
  readonly systemKey: SystemFieldKey;
  readonly types: readonly CustomQuestionType[];
  /** What the feature does with the field, for developers and the change dialog. */
  readonly powers: string;
}

export const FIELD_FEATURES = {
  'impact.age_bands': {
    systemKey: 'date_of_birth',
    types: ['date'],
    powers: 'Impact report: age bands',
  },
  'impact.nationalities': {
    systemKey: 'nationality',
    types: ['country'],
    powers: 'Impact report: participants by nationality',
  },
  'participants.nationality': {
    systemKey: 'nationality',
    types: ['country'],
    powers: 'Participants list: nationality column, filter and sort',
  },
  'participants.city': {
    systemKey: 'city',
    types: ['municipality'],
    powers: 'Participants list and conversations: municipality',
  },
  'participants.entity': {
    systemKey: 'reference_entity',
    types: ['short_text', 'single_choice', 'search_choice'],
    powers: 'Participants list: entity column and filter',
  },
  'participants.has_dependents': {
    systemKey: 'has_dependents',
    types: ['single_choice', 'yes_no'],
    powers: 'Participants list: dependents filter',
  },
  'participants.dependents_count': {
    systemKey: 'num_dependents',
    types: ['number'],
    powers: 'Participants list: number of dependents',
  },
  'notifications.entity': {
    systemKey: 'reference_entity',
    types: ['short_text', 'single_choice', 'search_choice'],
    powers: 'Notifications and surveys: the women of an entity',
  },
  'equipment.clothing_size': {
    systemKey: 'clothing_size',
    types: ['single_choice'],
    powers: 'Equipment handover: suggested clothing size',
  },
  'equipment.shoe_size': {
    systemKey: 'shoe_size',
    types: ['single_choice'],
    powers: 'Equipment handover: suggested shoe size',
  },
  'erasure.birth_year': {
    systemKey: 'date_of_birth',
    types: ['date'],
    powers: 'Erasure: the birth year kept for the reports',
  },
} as const satisfies Readonly<Record<string, FieldFeature>>;

export type FieldFeatureKey = keyof typeof FIELD_FEATURES;

/** A field as a feature sees it: its system key and its answer type. */
export interface FeatureFieldCandidate {
  readonly type: CustomQuestionType;
}

/**
 * The field a feature reads, from the app's fields by system key, or
 * undefined when the field is missing or its type no longer fits.
 */
export function fieldOfFeature<F extends FeatureFieldCandidate>(
  feature: FieldFeatureKey,
  fieldsBySystemKey: ReadonlyMap<string, F>,
): F | undefined {
  const { systemKey, types } = FIELD_FEATURES[feature];
  const field = fieldsBySystemKey.get(systemKey);
  return field !== undefined && (types as readonly CustomQuestionType[]).includes(field.type)
    ? field
    : undefined;
}

/** The features that read a field with this system key, and whether a type fits each. */
export function featuresOfField(
  systemKey: string | null,
  type: CustomQuestionType,
): ReadonlyArray<{ readonly feature: FieldFeatureKey; readonly fits: boolean }> {
  if (systemKey === null) return [];
  return (Object.keys(FIELD_FEATURES) as FieldFeatureKey[])
    .filter((feature) => FIELD_FEATURES[feature].systemKey === systemKey)
    .map((feature) => ({
      feature,
      fits: (FIELD_FEATURES[feature].types as readonly CustomQuestionType[]).includes(type),
    }));
}

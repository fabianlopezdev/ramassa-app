/**
 * Changing a field that has answers (RAPP-665, D8).
 *
 * Dades de les jugadores edits every field but her names: its answer type, its
 * options and its privacy level. Before a change to a field with answers is
 * saved, the page asks the database what it would do
 * (`public.preview_field_change`): how many answers convert to the new type
 * and how many leave the field for her history, how many get encrypted or
 * decrypted, how many team members gain or lose access, and which features
 * stop reading the field. Saving applies the same change in one transaction.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import type { Database, Json } from '../types/database';
import { FIELD_FEATURES, type FieldFeatureKey } from './field-features';
import type { ProfileField, QuestionPrivacy } from './profile-layout';
import { CUSTOM_QUESTION_TYPES, type CustomQuestionType } from './question-types';

type Client = SupabaseClient<Database>;

const privacySchema = z.enum(['normal', 'personal', 'sensitive']);
const count = z.number().int().nonnegative();

export const fieldChangePreviewSchema = z.object({
  type_from: z.enum(CUSTOM_QUESTION_TYPES),
  type_to: z.enum(CUSTOM_QUESTION_TYPES),
  privacy_from: privacySchema,
  privacy_to: privacySchema,
  answers: count,
  converted: count,
  not_converted: count,
  to_encrypt: count,
  to_decrypt: count,
  readers_gaining: count,
  readers_losing: count,
  conditions_cleared: count,
  features: z.array(
    z.object({ feature: z.string(), fits_now: z.boolean(), fits_after: z.boolean() }),
  ),
});

/** What saving a change would do to a field's answers. */
export interface FieldChangePreview {
  readonly answers: number;
  readonly converted: number;
  /** Answers that do not fit the new type: they leave the field for her history. */
  readonly notConverted: number;
  readonly isTypeChange: boolean;
  readonly isPrivacyChange: boolean;
  readonly privacyFrom: QuestionPrivacy;
  readonly privacyTo: QuestionPrivacy;
  readonly toEncrypt: number;
  readonly toDecrypt: number;
  /** Team members who will read these answers, or stop reading them. */
  readonly readersGaining: number;
  readonly readersLosing: number;
  /** Fields that opened on one of its options and will always show. */
  readonly conditionsCleared: number;
  /** The registry's features that read the field now and will not after. */
  readonly featuresLost: readonly FieldFeatureKey[];
  /** The ones that start reading it again. */
  readonly featuresRegained: readonly FieldFeatureKey[];
}

function isFeatureKey(key: string): key is FieldFeatureKey {
  return Object.prototype.hasOwnProperty.call(FIELD_FEATURES, key);
}

export function parseFieldChangePreview(raw: unknown): FieldChangePreview {
  const preview = fieldChangePreviewSchema.parse(raw);
  const features = preview.features.filter(
    (feature): feature is typeof feature & { feature: FieldFeatureKey } =>
      isFeatureKey(feature.feature),
  );
  return {
    answers: preview.answers,
    converted: preview.converted,
    notConverted: preview.not_converted,
    isTypeChange: preview.type_from !== preview.type_to,
    isPrivacyChange: preview.privacy_from !== preview.privacy_to,
    privacyFrom: preview.privacy_from,
    privacyTo: preview.privacy_to,
    toEncrypt: preview.to_encrypt,
    toDecrypt: preview.to_decrypt,
    readersGaining: preview.readers_gaining,
    readersLosing: preview.readers_losing,
    conditionsCleared: preview.conditions_cleared,
    featuresLost: features
      .filter((feature) => feature.fits_now && !feature.fits_after)
      .map((feature) => feature.feature),
    featuresRegained: features
      .filter((feature) => !feature.fits_now && feature.fits_after)
      .map((feature) => feature.feature),
  };
}

export interface FieldChange {
  readonly type: CustomQuestionType;
  readonly privacy: QuestionPrivacy;
  readonly options: readonly { readonly id: string | null; readonly label: unknown }[];
  readonly settings: Readonly<Record<string, unknown>>;
}

/** Asks the database what saving the change would do. Designers only, like saving. */
export async function previewFieldChange(
  client: Client,
  fieldId: string,
  change: FieldChange,
): Promise<FieldChangePreview> {
  const { data, error } = await client.rpc('preview_field_change', {
    p_field_id: fieldId,
    p_type: change.type,
    p_privacy: change.privacy,
    p_options: change.options.map((option) =>
      option.id === null ? { label: option.label } : { id: option.id, label: option.label },
    ) as Json,
    p_settings: change.settings as Json,
  });
  if (error) {
    throw new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
  }
  return parseFieldChangePreview(data);
}

/**
 * Whether saving needs the confirmation: the field has answers (or the page
 * cannot tell) and its type or privacy changes.
 */
export function needsChangeConfirmation(
  field: Pick<ProfileField, 'type' | 'privacy' | 'hasAnswers'>,
  change: Pick<FieldChange, 'type' | 'privacy'>,
): boolean {
  return (
    field.hasAnswers !== false && (field.type !== change.type || field.privacy !== change.privacy)
  );
}

/** Her names keep their type and privacy and are always asked (D2). */
export function isNameField(field: Pick<ProfileField, 'systemKey'>): boolean {
  return field.systemKey === 'first_name' || field.systemKey === 'last_name';
}

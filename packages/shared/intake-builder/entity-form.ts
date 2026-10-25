/**
 * The entity referral form as a surface of the Fitxa (RAPP-652).
 *
 * Staff place fields on `entity_form`, each required or not there and with an
 * optional wording for the entity. The portal draws the form from those
 * placements in their order, and the database checks the same rules:
 *
 *   - an app field the form knows (the twelve the referral asks) is asked with
 *     the form's own control while that control can read it; any other app
 *     field, or one staff changed past its control, is asked like a Ramassà
 *     field (RAPP-665);
 *   - her first and last name never leave it and stay required, because a
 *     referral names her;
 *   - a file or a signature is hers to give, never the entity's;
 *   - a required field left empty refuses the referral, a condition that
 *     does not apply asks nothing.
 */
import { SYSTEM_FIELD_QUESTIONS } from '../onboarding/system-fields';
import { layoutSystemFields } from './app-controls';
import { appControlFits } from './app-field-form';
import type { CustomAnswerValue, CustomQuestion, IntakeCatalog } from './builder';
import { placedQuestion } from './her-onboarding';
import {
  EMPTY_PROFILE_LAYOUT,
  fieldById,
  placementOn,
  placementsOnSurface,
  type FieldPlacement,
  type ProfileField,
  type ProfileLayout,
} from './profile-layout';
import { isStaffWritable } from './question-types';

/** The built-in fields the referral form can ask, as the database lists them. */
export const ENTITY_FORM_BUILTIN_FIELDS = [
  'first_name',
  'last_name',
  'phone',
  'date_of_birth',
  'nationality',
  'document',
  'city',
  'applicant_status',
  'supporting_entities',
  'reference_contact_name',
  'childcare_need',
  'specific_needs',
] as const;
export type EntityFormBuiltin = (typeof ENTITY_FORM_BUILTIN_FIELDS)[number];

/** A referral names her: these never leave the form and stay required. */
export const ENTITY_FORM_ALWAYS_ASKED: readonly EntityFormBuiltin[] = ['first_name', 'last_name'];

export function isEntityFormBuiltin(key: string | null): key is EntityFormBuiltin {
  return key !== null && (ENTITY_FORM_BUILTIN_FIELDS as readonly string[]).includes(key);
}

/** One field of the form, in its place. */
export type EntityFormItem =
  | {
      readonly kind: 'builtin';
      readonly key: EntityFormBuiltin;
      readonly field: ProfileField;
      readonly placement: FieldPlacement;
    }
  | {
      readonly kind: 'custom';
      /** The field as a question, worded for the entity and required as placed. */
      readonly question: CustomQuestion;
      readonly field: ProfileField;
      readonly placement: FieldPlacement;
    };

/** The live fields of the form, in order, each as the portal draws it. */
export function entityFormItems(layout: ProfileLayout): readonly EntityFormItem[] {
  // On a tie the app's own fields come first, so her names lead a form nobody arranged yet.
  const isBuiltin = (placement: FieldPlacement) =>
    fieldById(layout, placement.fieldId)?.kind === 'builtin' ? 0 : 1;
  const ordered = [...placementsOnSurface(layout, 'entity_form')].sort(
    (a, b) => a.sortOrder - b.sortOrder || isBuiltin(a) - isBuiltin(b),
  );
  const index = layoutSystemFields(layout);
  return ordered.flatMap((placement): EntityFormItem[] => {
    const field = fieldById(layout, placement.fieldId);
    if (field === undefined) return [];
    if (field.kind === 'builtin') {
      const question =
        field.builtinKey ??
        (field.systemKey == null ? null : SYSTEM_FIELD_QUESTIONS[field.systemKey]);
      // The form's own control asks a question it knows while it can read its
      // fields; its other parts ride with the first (RAPP-665).
      if (question !== null && isEntityFormBuiltin(question) && appControlFits(index, question)) {
        return isEntityFormBuiltin(field.builtinKey)
          ? [{ kind: 'builtin', key: field.builtinKey, field, placement }]
          : [];
      }
    }
    if (!isStaffWritable(field.type)) return [];
    return [
      { kind: 'custom', question: placedQuestion(layout, field, placement), field, placement },
    ];
  });
}

export function entityFormItemsOf(catalog: IntakeCatalog): readonly EntityFormItem[] {
  return entityFormItems(catalog.layout ?? EMPTY_PROFILE_LAYOUT);
}

/**
 * The form when the layout cannot be read (the catalog failed to load): the built-in fields in the app's order, her names
 * required, with no wording of their own, so each app shows its own label.
 */
export function entityFormFallbackItems(): readonly EntityFormItem[] {
  return ENTITY_FORM_BUILTIN_FIELDS.map((key, index): EntityFormItem => {
    const field: ProfileField = {
      id: `builtin:${key}`,
      sectionId: '',
      kind: 'builtin',
      builtinKey: key,
      type: 'short_text',
      label: {},
      help: null,
      privacy: 'normal',
      defaultRequired: false,
      settings: {},
      sortOrder: index,
      isArchived: false,
      createdAt: '',
      createdBy: null,
      createdByName: null,
      hasAnswers: null,
      options: [],
    };
    return {
      kind: 'builtin',
      key,
      field,
      placement: {
        id: `fallback:${key}`,
        fieldId: field.id,
        surface: 'entity_form',
        screenKey: null,
        sortOrder: index,
        required: ENTITY_FORM_ALWAYS_ASKED.includes(key),
        labelOverride: null,
        helpOverride: null,
      },
    };
  });
}

/** The Ramassà fields of the form as questions, for reading and checking their answers. */
export function entityFormQuestions(items: readonly EntityFormItem[]): readonly CustomQuestion[] {
  return items.flatMap((item) => (item.kind === 'custom' ? [item.question] : []));
}

/** Where a field of the Fitxa stands for the entity form, for the picker. */
export type EntityFormPick =
  | 'here'
  /** A file or a signature: hers to give. */
  | 'hers'
  | 'free';

export function entityFormPick(layout: ProfileLayout, field: ProfileField): EntityFormPick {
  if (placementOn(layout, field.id, 'entity_form') !== undefined) return 'here';
  return isStaffWritable(field.type) ? 'free' : 'hers';
}

/** Her names: never off the form, always required. */
export function isAlwaysOnEntityForm(field: ProfileField): boolean {
  return field.builtinKey !== null && ENTITY_FORM_ALWAYS_ASKED.includes(field.builtinKey as never);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === 'string') return value.trim() === '';
  return Array.isArray(value) && value.length === 0;
}

/**
 * The ids of the required fields left empty, every one read by its field id
 * (RAPP-663): an app field by the id of its first part (the document by its
 * type), her names under their fields' ids too. A condition that does not
 * apply asks nothing.
 */
export function requiredEntityFormFieldsLeftEmpty(
  items: readonly EntityFormItem[],
  answers: Readonly<Record<string, unknown>>,
): readonly string[] {
  return items.flatMap((item) => {
    if (!item.placement.required) return [];
    if (item.kind === 'custom') {
      const condition = item.question.showWhen;
      if (condition !== undefined && answers[condition.questionId] !== condition.optionId) {
        return [];
      }
    }
    return isEmpty(answers[item.field.id]) ? [item.field.id] : [];
  });
}

const FIELD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The Ramassà fields an entity answered, from `referral_answer_keys` (which
 * also names her profile keys), as answers for planning her onboarding: only
 * whether a field has an answer counts there, so each value is a marker.
 */
export function fieldsAnsweredByEntity(keys: readonly string[]): Record<string, CustomAnswerValue> {
  return Object.fromEntries(
    keys.filter((key) => FIELD_ID_PATTERN.test(key)).map((key) => [key, true]),
  );
}

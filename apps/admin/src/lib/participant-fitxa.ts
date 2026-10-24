/**
 * Her participant page on the Fitxa layout (RAPP-653), as pure readers: the
 * sections and fields in the Fitxa's order, her answer to each field with the
 * older seasons apart, the level a reader needs, and the per-player choice of
 * each field from her plan.
 */

import {
  fieldsOfSection,
  type ParticipantCustomAnswer,
  type PlanQuestion,
  type PlayerPlan,
  type ProfileField,
  type ProfileLayout,
  type ProfileSection,
  type QuestionPrivacy,
} from '@ramassa/shared/intake-builder';
import type { PermissionCode } from '@ramassa/shared/permissions';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface FitxaSection {
  readonly section: ProfileSection;
  readonly fields: readonly ProfileField[];
}

/**
 * Her page's sections, in the Fitxa's order: every live field, and an
 * archived one only while it holds an answer of hers. A section left with no
 * field is not drawn.
 */
export function fitxaSections(
  layout: ProfileLayout,
  answeredFieldIds: ReadonlySet<string>,
  language: LanguageCode = 'ca',
): readonly FitxaSection[] {
  return layout.sections
    .map((section) => ({
      section,
      fields: fieldsOfSection(layout, section.id, true, language).filter(
        (field) => !field.isArchived || answeredFieldIds.has(field.id),
      ),
    }))
    .filter((entry) => entry.fields.length > 0);
}

/** Her answer to one field: the current one, and the older seasons, newest first. */
export interface FieldAnswers {
  readonly current: ParticipantCustomAnswer;
  readonly older: readonly ParticipantCustomAnswer[];
}

/**
 * Her answers by field. The database sends each field's rows with the one of
 * no season first, then the seasons newest first: the first row is current.
 */
export function answersByField(
  rows: readonly ParticipantCustomAnswer[],
): ReadonlyMap<string, FieldAnswers> {
  const byField = new Map<string, ParticipantCustomAnswer[]>();
  for (const row of rows) {
    byField.set(row.questionId, [...(byField.get(row.questionId) ?? []), row]);
  }
  return new Map(
    [...byField].flatMap(([id, [current, ...older]]) =>
      current === undefined ? [] : [[id, { current, older }] as const],
    ),
  );
}

/** The permission a privacy level needs to be read. */
const LEVEL_PERMISSION: Readonly<Record<QuestionPrivacy, PermissionCode>> = {
  normal: 'participants.view',
  personal: 'participants.view_personal',
  sensitive: 'participants.view_sensitive',
};

/** The level the reader lacks to read a field, or null when she may read it. */
export function missingLevel(
  field: Pick<ProfileField, 'privacy'>,
  sees: (code: PermissionCode) => boolean,
): Exclude<QuestionPrivacy, 'normal'> | null {
  if (field.privacy === 'normal' || sees(LEVEL_PERMISSION[field.privacy])) return null;
  return field.privacy;
}

/**
 * Each question of her plan by field: a built-in field by the app's question
 * it is, a Ramassà field by its id. A field her onboarding does not ask has
 * no choice.
 */
export function planQuestionsByField(
  plan: PlayerPlan,
  fields: readonly ProfileField[],
): ReadonlyMap<string, PlanQuestion> {
  const byKey = new Map(
    plan.screens.flatMap((screen) => screen.questions).map((question) => [question.key, question]),
  );
  return new Map(
    fields.flatMap((field) => {
      const question = byKey.get(field.builtinKey ?? field.id);
      return question === undefined ? [] : [[field.id, question] as const];
    }),
  );
}

/**
 * Her participant page on the Fitxa layout (RAPP-653, RAPP-664), as pure
 * readers: the sections and fields in the Fitxa's order, her answer to each
 * field with the older seasons apart, the level a reader needs, the fields
 * one editor changes together, her season answers in words, and the
 * per-player choice of each field from her plan.
 */

import {
  answerText,
  fieldById,
  fieldsOfSection,
  questionOfField,
  systemField,
  textIn,
  type CustomAnswerValue,
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
 * archived one only while it holds an answer of hers. A field shown only on
 * an answer (`show_when`) shows when that answer holds, or while it keeps an
 * answer of hers. A section left with no field is not drawn.
 */
export function fitxaSections(
  layout: ProfileLayout,
  answers: ReadonlyMap<string, FieldAnswers>,
  language: LanguageCode = 'ca',
): readonly FitxaSection[] {
  const applies = (field: ProfileField) =>
    field.showWhen === undefined ||
    answers.get(field.showWhen.fieldId)?.current.value === field.showWhen.optionId;
  return layout.sections
    .map((section) => ({
      section,
      fields: fieldsOfSection(layout, section.id, true, language).filter(
        (field) => answers.has(field.id) || (!field.isArchived && applies(field)),
      ),
    }))
    .filter((entry) => entry.fields.length > 0);
}

/** Her names stay on her account (D2): their fields hold no answer. */
export function isNameField(field: Pick<ProfileField, 'systemKey'>): boolean {
  return field.systemKey === 'first_name' || field.systemKey === 'last_name';
}

/**
 * When a field that goes with another one is asked, in the editor of that
 * other one: a field shown on one of its answers (`show_when`), on that
 * answer; the document's number, on any document type but none, because the
 * database refuses a joined player's document without its number
 * (`private.apply_document_rule`).
 */
type PartnerCondition = (value: CustomAnswerValue | null | undefined) => boolean;

export interface EditPartner {
  readonly field: ProfileField;
  readonly asksWhen: PartnerCondition;
}

/** The live fields one editor changes together with this one, each with when it is asked. */
export function fieldsEditedWith(
  layout: ProfileLayout,
  field: ProfileField,
): readonly EditPartner[] {
  const conditioned = layout.fields
    .filter((other) => !other.isArchived && other.showWhen?.fieldId === field.id)
    .map((other) => ({
      field: other,
      asksWhen: (value: CustomAnswerValue | null | undefined) => value === other.showWhen?.optionId,
    }));
  const number = systemField(layout, 'document_number');
  const document =
    field.systemKey === 'document_type' && number !== undefined && !number.isArchived
      ? [
          {
            field: number,
            asksWhen: (value: CustomAnswerValue | null | undefined) => {
              const key = field.options.find((option) => option.id === value)?.key ?? null;
              return typeof value === 'string' && value !== '' && key !== 'none';
            },
          },
        ]
      : [];
  return [...conditioned, ...document].filter(
    (partner, index, all) =>
      all.findIndex((other) => other.field.id === partner.field.id) === index,
  );
}

/** One season's answers of hers, in words, for her authorization panel. */
export interface SeasonAnswersLine {
  readonly seasonName: string;
  readonly text: string;
}

/** The types whose answer says nothing without the field's name ("Sí"). */
const NAMED_TYPES: ReadonlySet<string> = new Set(['yes_no', 'yes_no_maybe', 'consent', 'number']);

/**
 * Her answers by season, newest season first, each season's answers in the
 * Fitxa's order and joined in one line. Her answers of no season are not
 * here: the sections above show them.
 */
export function seasonAnswersLines(
  layout: ProfileLayout,
  rows: readonly ParticipantCustomAnswer[],
  language: LanguageCode,
  words: Parameters<typeof answerText>[3],
): readonly SeasonAnswersLine[] {
  const order = fitxaSections(layout, new Map(), language).flatMap((entry) =>
    entry.fields.map((each) => each.id),
  );
  const position = (id: string) => {
    const index = order.indexOf(id);
    return index < 0 ? order.length : index;
  };
  const seasons = new Map<string, ParticipantCustomAnswer[]>();
  for (const row of rows) {
    if (row.seasonName === null) continue;
    seasons.set(row.seasonName, [...(seasons.get(row.seasonName) ?? []), row]);
  }
  return [...seasons].map(([seasonName, answers]) => ({
    seasonName,
    text: [...answers]
      .sort((a, b) => position(a.questionId) - position(b.questionId))
      .flatMap((row) => {
        const field = fieldById(layout, row.questionId);
        if (field === undefined) return [];
        const text = answerText(questionOfField(layout, field), row.value, language, words);
        return [NAMED_TYPES.has(field.type) ? `${textIn(field.label, language)} ${text}` : text];
      })
      .join(' · '),
  }));
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

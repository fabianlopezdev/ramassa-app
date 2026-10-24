/**
 * One section of the Fitxa on her page (RAPP-653): its fields in the Fitxa's
 * order, each with her answer, who gave it and when, the per-player choice
 * and Edit. The app's own fields read her record and save through the profile
 * update path; Ramassà fields read her answers and save through
 * `set_participant_custom_answers`. A field no surface asks (team only) is
 * filled in here and nowhere else.
 *
 * Privacy stays the database's: an answer above the reader's level never
 * reaches the page, and its row says which level it needs.
 */

import { EditorSection } from '@/components/layout/editor-section';
import { answerSourceText } from '@/components/participants/answer-source';
import { shownBuiltinAnswer } from '@/components/participants/builtin-answer-text';
import { isBuiltinEditKey } from '@/components/participants/builtin-field-controls';
import { BuiltinFieldEditor } from '@/components/participants/builtin-field-editor';
import {
  CustomAnswerValueView,
  useAnswerWords,
} from '@/components/participants/custom-answer-value';
import { CustomFieldEditor } from '@/components/participants/custom-field-editor';
import { ProfileAnswerRow, type RowChoice } from '@/components/participants/profile-answer-row';
import { missingLevel, type FieldAnswers } from '@/lib/participant-fitxa';
import { useTranslation } from 'react-i18next';
import type { AnsweredQuestions, IntakeQuestionState } from '@ramassa/shared/intake';
import {
  answerText,
  isStaffWritable,
  questionOfField,
  textIn,
  type CustomAnswerValue,
  type PlanQuestion,
  type ProfileField,
  type ProfileLayout,
  type ProfileSection as Section,
} from '@ramassa/shared/intake-builder';
import type {
  ParticipantDetailRow,
  ProfileAnswerOrigin,
  ProfilePrefillPayload,
} from '@ramassa/shared/participants';
import type { PermissionCode } from '@ramassa/shared/permissions';
import type { LanguageCode, UpdateOwnProfilePayload } from '@ramassa/shared/schemas';

/** What every row of her page reads and writes through. */
export interface FitxaContext {
  readonly participant: ParticipantDetailRow;
  readonly layout: ProfileLayout;
  /** Her answers to Ramassà fields, by field. */
  readonly answers: ReadonlyMap<string, FieldAnswers>;
  /** Who answered each of the app's questions, by question. */
  readonly origins: ReadonlyMap<string, ProfileAnswerOrigin>;
  /** What somebody answered, for a woman who has not joined; null once she joined. */
  readonly answered: AnsweredQuestions | null;
  readonly sees: (code: PermissionCode) => boolean;
  /** participants.view_personal: the team completes and corrects her answers. */
  readonly canEdit: boolean;
  /** Her plan's question per field while choices are shown; null when they are not. */
  readonly choices: ReadonlyMap<string, PlanQuestion> | null;
  readonly isChoiceBusy: boolean;
  readonly onChoice: (question: PlanQuestion, state: IntakeQuestionState) => void;
  readonly editingId: string | null;
  readonly onEditingChange: (id: string | null) => void;
  readonly onSaveBuiltin: (
    payload: UpdateOwnProfilePayload | ProfilePrefillPayload,
  ) => Promise<void>;
  readonly onSaveCustom: (fieldId: string, value: CustomAnswerValue | null) => Promise<void>;
  readonly onOpenFile?: (objectKey: string) => Promise<void>;
}

export function ProfileSection({
  section,
  fields,
  context,
}: {
  readonly section: Section;
  readonly fields: readonly ProfileField[];
  readonly context: FitxaContext;
}) {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  return (
    <EditorSection
      title={textIn(section.title, language)}
      isFlush
      testId={`fitxa-section-${section.key}`}
    >
      <ul className="flex flex-col divide-y">
        {fields.map((field) => (
          <FitxaFieldRow key={field.id} field={field} context={context} />
        ))}
      </ul>
    </EditorSection>
  );
}

function FitxaFieldRow({
  field,
  context,
}: {
  readonly field: ProfileField;
  readonly context: FitxaContext;
}) {
  const { t, i18n } = useTranslation(['participants', 'onboarding', 'profile', 'common']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const language = locale as LanguageCode;
  const words = useAnswerWords();
  const name = textIn(field.label, language);
  const lockedLevel = missingLevel(field, context.sees);
  const question = context.choices?.get(field.id) ?? null;
  const choice: RowChoice | null =
    question === null
      ? null
      : {
          question,
          isBusy: context.isChoiceBusy,
          onChange: (state) => context.onChoice(question, state),
        };
  const isEditing = context.editingId === field.id;
  const onToggleEdit = () => context.onEditingChange(isEditing ? null : field.id);
  const close = () => context.onEditingChange(null);
  const common = {
    name,
    lockedLevel,
    choice,
    hasChoiceColumn: context.choices !== null,
    isEditing,
    onToggleEdit,
    testId: `fitxa-field-${field.builtinKey ?? field.id}`,
  };

  if (field.kind === 'builtin' && field.builtinKey !== null) {
    const key = field.builtinKey;
    const origin = context.origins.get(key);
    return (
      <ProfileAnswerRow
        {...common}
        value={shownBuiltinAnswer(key, context.participant, context.answered, t, locale)}
        source={origin === undefined ? null : answerSourceText(origin, t, locale)}
        canEdit={context.canEdit && lockedLevel === null && isBuiltinEditKey(key)}
        editor={
          isBuiltinEditKey(key) ? (
            <BuiltinFieldEditor
              fieldKey={key}
              participant={context.participant}
              answered={context.answered}
              canSeeSensitive={context.sees('participants.view_sensitive')}
              onSave={async (payload) => {
                await context.onSaveBuiltin(payload);
                close();
              }}
              onCancel={close}
            />
          ) : undefined
        }
      />
    );
  }

  const asked = questionOfField(context.layout, field);
  const answers = context.answers.get(field.id);
  const current = answers?.current;
  const seasonOf = (seasonName: string | null) => (seasonName === null ? '' : ` · ${seasonName}`);
  return (
    <ProfileAnswerRow
      {...common}
      value={
        current === undefined ? null : (
          <CustomAnswerValueView
            question={asked}
            value={current.value}
            answeredAt={current.answeredAt}
            language={language}
            onOpenFile={context.onOpenFile}
          />
        )
      }
      source={
        current === undefined
          ? null
          : `${answerSourceText(current, t, locale)}${seasonOf(current.seasonName)}`
      }
      older={(answers?.older ?? []).map(
        (row) =>
          `${row.seasonName ?? ''}: ${answerText(asked, row.value, language, words, { answeredAt: row.answeredAt })}`,
      )}
      // A file or a signature is hers to give; an archived field keeps what she said.
      canEdit={
        context.canEdit && lockedLevel === null && !field.isArchived && isStaffWritable(field.type)
      }
      editor={
        <CustomFieldEditor
          question={asked}
          value={current?.value}
          language={language}
          onSave={async (value) => {
            await context.onSaveCustom(field.id, value);
            close();
          }}
          onCancel={close}
        />
      }
    />
  );
}

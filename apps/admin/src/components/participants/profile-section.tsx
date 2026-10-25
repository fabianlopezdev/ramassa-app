/**
 * One section of the Fitxa on her page (RAPP-653, RAPP-664): its fields in the
 * Fitxa's order, each with her answer, who gave it and when, the per-player
 * choice and Edit. Every field reads her answers by field and saves through
 * her record (`update_participant_profile`), the app's fields and the team's
 * alike, with one editor. Her names stay on her account (D2).
 *
 * Privacy stays the database's: an answer above the reader's level never
 * reaches the page, and its row says which level it needs (from the field's
 * level in the layout).
 */

import { EditorSection } from '@/components/layout/editor-section';
import { answerSourceText } from '@/components/participants/answer-source';
import {
  CustomAnswerValueView,
  useAnswerWords,
} from '@/components/participants/custom-answer-value';
import {
  FieldAnswerEditor,
  type FieldAnswerChanges,
} from '@/components/participants/field-answer-editor';
import { ProfileAnswerRow, type RowChoice } from '@/components/participants/profile-answer-row';
import {
  fieldsEditedWith,
  isNameField,
  missingLevel,
  type FieldAnswers,
} from '@/lib/participant-fitxa';
import { useTranslation } from 'react-i18next';
import type { IntakeQuestionState } from '@ramassa/shared/intake';
import {
  answerText,
  isStaffWritable,
  questionOfField,
  textIn,
  type PlanQuestion,
  type ProfileField,
  type ProfileLayout,
  type ProfileSection as Section,
} from '@ramassa/shared/intake-builder';
import type { ParticipantUpdate } from '@ramassa/shared/participants';
import type { PermissionCode } from '@ramassa/shared/permissions';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** What every row of her page reads and writes through. */
export interface FitxaContext {
  /** Her names, on her account. */
  readonly names: { readonly first_name: string; readonly last_name: string };
  readonly layout: ProfileLayout;
  /** Her answers, by field. */
  readonly answers: ReadonlyMap<string, FieldAnswers>;
  readonly sees: (code: PermissionCode) => boolean;
  /** participants.view_personal: the team completes and corrects her answers. */
  readonly canEdit: boolean;
  /** Her plan's question per field while choices are shown; null when they are not. */
  readonly choices: ReadonlyMap<string, PlanQuestion> | null;
  readonly isChoiceBusy: boolean;
  readonly onChoice: (question: PlanQuestion, state: IntakeQuestionState) => void;
  readonly editingId: string | null;
  readonly onEditingChange: (id: string | null) => void;
  /** Throws when the database refuses, so the editor stays open and says why. */
  readonly onSave: (update: ParticipantUpdate) => Promise<void>;
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
  const close = () => context.onEditingChange(null);
  const asked = questionOfField(context.layout, field);
  const isName = isNameField(field);
  const name = isName ? (field.systemKey as 'first_name' | 'last_name') : null;
  const answers = context.answers.get(field.id);
  const current = answers?.current;
  const seasonOf = (seasonName: string | null) => (seasonName === null ? '' : ` · ${seasonName}`);
  // The fields that go with this one, edited in the same form; only those she may read.
  const partners = fieldsEditedWith(context.layout, field)
    .filter((partner) => missingLevel(partner.field, context.sees) === null)
    .map((partner) => ({
      ...partner,
      question: questionOfField(context.layout, partner.field),
      value: context.answers.get(partner.field.id)?.current.value,
    }));

  async function save(changes: FieldAnswerChanges) {
    const typed = String(changes[field.id] ?? '');
    if (name === 'first_name') {
      await context.onSave({ first_name: typed, answers: {} });
    } else if (name === 'last_name') {
      await context.onSave({ last_name: typed, answers: {} });
    } else {
      await context.onSave({ answers: changes });
    }
    close();
  }

  return (
    <ProfileAnswerRow
      name={textIn(field.label, language)}
      lockedLevel={lockedLevel}
      choice={choice}
      hasChoiceColumn={context.choices !== null}
      isEditing={isEditing}
      onToggleEdit={() => context.onEditingChange(isEditing ? null : field.id)}
      testId={`fitxa-field-${field.builtinKey ?? field.systemKey ?? field.id}`}
      value={
        name !== null ? (
          context.names[name]
        ) : current === undefined ? null : (
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
        <FieldAnswerEditor
          question={asked}
          value={name !== null ? context.names[name] : current?.value}
          partners={partners}
          isRequired={name !== null}
          language={language}
          onSave={save}
          onCancel={close}
        />
      }
    />
  );
}

/**
 * The form of one piece of player information (RAPP-650): its name and help
 * in the five languages, its type from the tiles (RAPP-646), its privacy from
 * the cards (RAPP-647), the type's settings and, for a choice, its options.
 *
 * The Fitxa de la jugadora opens it for a field; the old question forms wrap
 * it and add their own places (`extra`, `validate`). The type never changes
 * once saved, and the privacy level is locked by the caller (once answers
 * exist for a field). A removed option is archived and the answers that
 * chose it keep it. The form is uncontrolled and read with FormData.
 */

import { LanguageFields, textFromForm } from '@/components/fields/language-fields';
import { QuestionPrivacyPicker } from '@/components/settings/question-privacy-picker';
import {
  pastedOptions,
  QuestionPreview,
  QuestionSettingsFields,
  readPreviewDraft,
  readQuestionSettings,
  type PreviewDraft,
} from '@/components/settings/question-type-fields';
import { QuestionTypePicker } from '@/components/settings/question-type-picker';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessageKey, isAppError } from '@ramassa/shared/errors';
import {
  isChoiceType,
  profileFieldDraftSchema,
  textIn,
  type BuilderText,
  type CustomQuestionType,
  type QuestionPrivacy,
  type QuestionSettings,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** What the form starts from: a saved field or question. */
export interface FieldFormValue {
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly privacy: QuestionPrivacy;
  readonly settings: QuestionSettings;
  /** The options still offered, in order. */
  readonly options: readonly { readonly id: string; readonly label: BuilderText }[];
}

/** What the form saves. */
export interface FieldFormDraft {
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly privacy: QuestionPrivacy;
  readonly settings: QuestionSettings;
  /** In order; an option without an id is new, a saved one left out is archived. */
  readonly options: readonly { readonly id: string | null; readonly label: BuilderText }[];
}

export function ErrorLine({ message }: { readonly message: string | null }) {
  return message === null ? null : (
    <p aria-live="polite" className="text-start text-sm text-destructive">
      {message}
    </p>
  );
}

/** Runs a save, shows the database's reason when it refuses. */
export function useAction() {
  const { t } = useTranslation(['settings', 'errors']);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>): Promise<boolean> {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (thrown) {
      setError(
        isAppError(thrown) ? t(getErrorMessageKey(thrown.code)) : t('settings:questions.failed'),
      );
      return false;
    } finally {
      setIsBusy(false);
    }
  }
  return { isBusy, error, setError, run };
}

export function FieldForm({
  value,
  title,
  nameLegend,
  submitLabel,
  isPrivacyLocked,
  canStoreFiles,
  extra,
  validate,
  onSave,
  onCancel,
  withPreview = false,
  onPreviewChange,
  isFramed = true,
  testId = 'field-form',
}: {
  /** Null for a new one. */
  readonly value: FieldFormValue | null;
  readonly title: string;
  /** The legend of the name: "Name" for a field, "Question" for a question. */
  readonly nameLegend: string;
  readonly submitLabel: string;
  readonly isPrivacyLocked: boolean;
  readonly canStoreFiles: boolean;
  /** More inputs after the privacy, given the chosen type (the old question's places). */
  readonly extra?: (type: CustomQuestionType) => ReactNode;
  /** One more check on submit, with the form's values; a message refuses the save. */
  readonly validate?: (fields: FormData, type: CustomQuestionType) => string | null;
  readonly onSave: (draft: FieldFormDraft, fields: FormData) => Promise<void>;
  readonly onCancel: () => void;
  /** A preview of her phone beside the form. */
  readonly withPreview?: boolean;
  /** Each change as her phone would show it, for a page that draws its own phone. */
  readonly onPreviewChange?: (draft: PreviewDraft) => void;
  /** False inside a dialog, which is its own frame. */
  readonly isFramed?: boolean;
  readonly testId?: string;
}) {
  const { t } = useTranslation('settings');
  const action = useAction();
  const isNew = value === null;
  const [type, setType] = useState<CustomQuestionType>(value?.type ?? 'short_text');
  const [privacy, setPrivacy] = useState<QuestionPrivacy>(value?.privacy ?? 'personal');
  const kept = value?.options ?? [];
  const [newOptions, setNewOptions] = useState(isNew ? 2 : 0);
  const formRef = useRef<HTMLFormElement>(null);
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  const optionNames = [
    ...kept.map((option) => `option-${option.id}`),
    ...Array.from({ length: newOptions }, (_, index) => `option-new-${index}`),
  ];
  const [preview, setPreview] = useState<PreviewDraft>(() => ({
    type,
    label: value?.label ?? {},
    help: value?.help ?? {},
    settings: value?.settings ?? {},
    options: kept.map((option) => option.label),
  }));
  const refreshPreview = () => {
    if (formRef.current === null) return;
    const next = readPreviewDraft(formRef.current, type, optionNames);
    setPreview(next);
    onPreviewChange?.(next);
  };
  // The type and the number of option fields change what the form holds.
  useEffect(refreshPreview, [type, newOptions]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const options = isChoiceType(type)
      ? [
          ...kept
            .filter((option) => fields.get(`option-remove-${option.id}`) !== 'on')
            .map((option) => ({
              id: option.id,
              label: textFromForm(fields, `option-${option.id}`),
            })),
          ...Array.from({ length: newOptions }, (_, index) => ({
            id: null,
            label: textFromForm(fields, `option-new-${index}`),
          })).filter((option) => Object.keys(option.label).length > 0),
          // A long list pasted one per line, in Catalan.
          ...(type === 'search_choice'
            ? pastedOptions(fields).map((ca) => ({ id: null, label: { ca } }))
            : []),
        ]
      : [];
    const help = textFromForm(fields, 'question-help');
    const draft: FieldFormDraft = {
      type,
      label: textFromForm(fields, 'question-label'),
      help: Object.keys(help).length === 0 ? null : help,
      privacy: isPrivacyLocked && value !== null ? value.privacy : privacy,
      settings: readQuestionSettings(fields, type),
      options,
    };
    const checked = profileFieldDraftSchema.safeParse(draft);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      const path = issue?.path[0];
      action.setError(
        path === 'options'
          ? issue?.message === 'too many options'
            ? t('questions.tooManyOptions')
            : t('questions.optionsNeeded')
          : path === 'settings'
            ? t('questions.settingsInvalid')
            : t('questions.catalanNeeded'),
      );
      return;
    }
    const refused = validate?.(fields, type) ?? null;
    if (refused !== null) {
      action.setError(refused);
      return;
    }
    if (await action.run(() => onSave(draft, fields))) onCancel();
  }

  return (
    <div
      className={
        withPreview ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]' : 'grid gap-4'
      }
    >
      <form
        ref={formRef}
        className={cn('flex flex-col gap-3', isFramed && 'rounded-xl border bg-card p-4')}
        data-testid={testId}
        onSubmit={(event) => void submit(event)}
        onChange={refreshPreview}
        onInput={refreshPreview}
      >
        {isFramed ? <h3 className="text-start font-semibold">{title}</h3> : null}
        <LanguageFields
          name="question-label"
          legend={nameLegend}
          value={value?.label}
          isCatalanRequired
        />
        <QuestionTypePicker
          value={type}
          onChange={setType}
          isLocked={!isNew}
          warnings={
            canStoreFiles ? {} : { file_upload: t('questions.settings.uploadsUnavailable') }
          }
        />
        <QuestionPrivacyPicker
          value={isPrivacyLocked && value !== null ? value.privacy : privacy}
          onChange={setPrivacy}
          isLocked={isPrivacyLocked}
        />
        {extra?.(type)}
        <LanguageFields
          name="question-help"
          legend={t('questions.help')}
          value={value?.help}
          isCatalanRequired={false}
          isLong
        />
        <QuestionSettingsFields
          key={type}
          type={type}
          settings={value?.type === type ? value.settings : undefined}
          uploadsAvailable={canStoreFiles}
          consentTextField={
            <LanguageFields
              name="setting-consent-text"
              legend={t('questions.settings.consentText')}
              value={
                value !== null && 'text' in value.settings
                  ? (value.settings as { readonly text: BuilderText }).text
                  : null
              }
              isCatalanRequired
              isLong
            />
          }
        />
        {isChoiceType(type) ? (
          <div className="flex flex-col gap-3" data-testid="question-options">
            <p className="text-start text-sm font-medium">{t('questions.options')}</p>
            {kept.map((option) => (
              <div key={option.id} className="flex flex-col gap-1">
                <LanguageFields
                  name={`option-${option.id}`}
                  legend={textIn(option.label, 'ca')}
                  value={option.label}
                  isCatalanRequired
                />
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name={`option-remove-${option.id}`} />
                  <span>{t('questions.removeOption')}</span>
                </label>
              </div>
            ))}
            {Array.from({ length: newOptions }, (_, index) => (
              <LanguageFields
                key={`new-${index}`}
                name={`option-new-${index}`}
                legend={t('questions.newOption', { number: kept.length + index + 1 })}
                value={null}
                isCatalanRequired={false}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setNewOptions((count) => count + 1)}
            >
              {t('questions.addOption')}
            </Button>
          </div>
        ) : null}
        <ErrorLine message={action.error} />
        <div className={cn('flex gap-2', !isFramed && 'justify-end')}>
          {isFramed ? null : (
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('questions.cancel')}
            </Button>
          )}
          <Button type="submit" disabled={action.isBusy} data-testid={`${testId}-save`}>
            {submitLabel}
          </Button>
          {isFramed ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('questions.cancel')}
            </Button>
          ) : null}
        </div>
      </form>
      {withPreview ? (
        <QuestionPreview
          draft={preview}
          language={previewLanguage}
          onLanguageChange={setPreviewLanguage}
        />
      ) : null}
    </div>
  );
}

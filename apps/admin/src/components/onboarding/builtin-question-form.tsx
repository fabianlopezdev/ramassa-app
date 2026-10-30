/**
 * The wording of one of the app's own questions on its onboarding screen
 * (RAPP-307, RAPP-641): label and help, and whether it is hidden. A question
 * the app needs cannot be hidden, and the form says why. Its options are the
 * options of its field, named on Dades de les jugadores (RAPP-664, RAPP-665). The form
 * is uncontrolled and read with FormData.
 *
 * What staff see is what she sees (RAPP-719, as RAPP-710): each box holds the
 * text her phone shows in its language, the saved text or else the app's own.
 * A language still equal to the app's text is not saved. The label cannot be
 * saved empty; a cleared help shows nothing.
 */

import { useChangedForm } from '@/components/fields/changed-form';
import { ErrorLine, useAction } from '@/components/fields/field-form';
import { LanguageFields } from '@/components/fields/language-fields';
import { Button } from '@/components/ui/button';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import { staffTextIn, staffTextToSave } from '@ramassa/shared/i18n/localized-content';
import {
  INTAKE_QUESTION_LABEL_KEYS,
  type IntakeQuestion,
  type RequiredQuestions,
} from '@ramassa/shared/intake';
import {
  builtinHideLock,
  canHideBuiltin,
  type BuilderText,
  type BuiltinOverride,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface BuiltinQuestionInfo {
  readonly question: IntakeQuestion;
  /** The app's own label, in the staff member's language. */
  readonly label: string;
}

export function BuiltinForm({
  info,
  override,
  required,
  onSave,
  onCancel,
  onLabelChange,
}: {
  readonly info: BuiltinQuestionInfo;
  readonly override: BuiltinOverride | undefined;
  /** The organization's required list (RAPP-611): a required question never hides. */
  readonly required: RequiredQuestions;
  readonly onSave: (override: BuiltinOverride) => Promise<void>;
  readonly onCancel: () => void;
  /** The label as typed, for a phone preview beside the form (RAPP-641). */
  readonly onLabelChange?: (label: BuilderText) => void;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const action = useAction();
  const [emptyLabel, setEmptyLabel] = useState<string | null>(null);
  const changed = useChangedForm();
  const lock = builtinHideLock(info.question, required);
  /** The app's own label in one language. Its help has no text of its own. */
  const appLabel = (language: LanguageCode) =>
    t(INTAKE_QUESTION_LABEL_KEYS[info.question] ?? info.question, { lng: language });
  // What her phone shows in each language: the saved text, else the app's.
  const shownLabel = Object.fromEntries(
    SUPPORTED_LANGUAGES.map((language) => [
      language,
      staffTextIn(override?.label, language, false) ?? appLabel(language),
    ]),
  ) as BuilderText;
  const shownHelp = Object.fromEntries(
    SUPPORTED_LANGUAGES.map((language) => [
      language,
      staffTextIn(override?.help, language, true) ?? '',
    ]),
  ) as BuilderText;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const label = typedText(fields, 'builtin-label');
    const empty = SUPPORTED_LANGUAGES.find((language) => (label[language] ?? '').trim() === '');
    if (empty !== undefined) {
      setEmptyLabel(t('questions.labelRequiredIn', { language: LANGUAGE_NATIVE_NAMES[empty] }));
      return;
    }
    setEmptyLabel(null);
    const next: BuiltinOverride = {
      question: info.question,
      label: staffTextToSave(label, appLabel, false) ?? null,
      help: staffTextToSave(typedText(fields, 'builtin-help'), () => '', true) ?? null,
      isHidden: canHideBuiltin(info.question, required) && fields.get('builtin-hidden') === 'on',
    };
    if (await action.run(() => onSave(next))) onCancel();
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
      data-testid="builtin-form"
      ref={changed.formRef}
      onSubmit={(event) => void submit(event)}
      onInput={(event) => {
        changed.track(event.currentTarget);
        onLabelChange?.(typedText(new FormData(event.currentTarget), 'builtin-label'));
      }}
    >
      <h3 className="text-start font-semibold">{info.label}</h3>
      <LanguageFields
        name="builtin-label"
        legend={t('questions.label')}
        value={shownLabel}
        isCatalanRequired={false}
      />
      <LanguageFields
        name="builtin-help"
        legend={t('questions.help')}
        value={shownHelp}
        isCatalanRequired={false}
        isLong
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="builtin-hidden"
          defaultChecked={lock === undefined && (override?.isHidden ?? false)}
          disabled={lock !== undefined}
          aria-describedby={lock === undefined ? undefined : 'builtin-hidden-lock'}
        />
        <span>{t('questions.hideQuestion')}</span>
      </label>
      {lock === undefined ? null : (
        <p id="builtin-hidden-lock" className="text-start text-xs text-muted-foreground">
          {t(`questions.lock.${lock}`)}
        </p>
      )}
      <ErrorLine message={emptyLabel ?? action.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={action.isBusy || !changed.isChanged}>
          {t('questions.saveBuiltin')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('questions.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Each language's box as typed, blank ones kept: a cleared box is a choice (RAPP-719). */
function typedText(fields: FormData, name: string): BuilderText {
  return Object.fromEntries(
    SUPPORTED_LANGUAGES.flatMap((language) => {
      const value = fields.get(`${name}.${language}`);
      return typeof value === 'string' ? [[language, value]] : [];
    }),
  ) as BuilderText;
}

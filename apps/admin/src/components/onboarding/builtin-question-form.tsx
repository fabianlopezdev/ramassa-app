/**
 * The wording of one of the app's own questions on its onboarding screen
 * (RAPP-307, RAPP-641): label, help, option labels and hidden options. A
 * question the app needs cannot be hidden, and the form says why. The form is
 * uncontrolled and read with FormData.
 */

import { ErrorLine, useAction } from '@/components/fields/field-form';
import { LanguageFields, textFromForm } from '@/components/fields/language-fields';
import { Button } from '@/components/ui/button';
import { type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { IntakeQuestion, RequiredQuestions } from '@ramassa/shared/intake';
import {
  builtinHideLock,
  canHideBuiltin,
  type BuilderText,
  type BuiltinOverride,
} from '@ramassa/shared/intake-builder';

export interface BuiltinQuestionInfo {
  readonly question: IntakeQuestion;
  /** The app's own label, in the staff member's language. */
  readonly label: string;
  /** The options staff may relabel or hide; none for a picker list. */
  readonly options: readonly { readonly value: string; readonly label: string }[];
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
  const { t } = useTranslation('settings');
  const action = useAction();
  const lock = builtinHideLock(info.question, required);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const label = textFromForm(fields, 'builtin-label');
    const help = textFromForm(fields, 'builtin-help');
    const next: BuiltinOverride = {
      question: info.question,
      label: Object.keys(label).length === 0 ? null : label,
      help: Object.keys(help).length === 0 ? null : help,
      isHidden: canHideBuiltin(info.question, required) && fields.get('builtin-hidden') === 'on',
      optionOverrides: Object.fromEntries(
        info.options.map((option) => [
          option.value,
          {
            label: textFromForm(fields, `builtin-option-${option.value}`),
            hidden: fields.get(`builtin-option-hidden-${option.value}`) === 'on',
          },
        ]),
      ),
    };
    if (
      info.options.length > 0 &&
      info.options.every((option) => next.optionOverrides[option.value]?.hidden)
    ) {
      action.setError(t('questions.oneOptionStays'));
      return;
    }
    if (await action.run(() => onSave(next))) onCancel();
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
      data-testid="builtin-form"
      onSubmit={(event) => void submit(event)}
      onInput={(event) =>
        onLabelChange?.(textFromForm(new FormData(event.currentTarget), 'builtin-label'))
      }
    >
      <h3 className="text-start font-semibold">{info.label}</h3>
      <p className="text-start text-sm text-muted-foreground">{t('questions.builtinIntro')}</p>
      <LanguageFields
        name="builtin-label"
        legend={t('questions.label')}
        value={override?.label}
        isCatalanRequired={false}
      />
      <LanguageFields
        name="builtin-help"
        legend={t('questions.help')}
        value={override?.help}
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
      {info.options.length === 0 ? (
        <p className="text-start text-xs text-muted-foreground">
          {t('questions.lock.optionsList')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-start text-sm font-medium">{t('questions.options')}</p>
          <p className="text-start text-xs text-muted-foreground">
            {t('questions.lock.optionValues')}
          </p>
          {info.options.map((option) => (
            <div key={option.value} className="flex flex-col gap-1">
              <LanguageFields
                name={`builtin-option-${option.value}`}
                legend={option.label}
                value={override?.optionOverrides[option.value]?.label}
                isCatalanRequired={false}
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name={`builtin-option-hidden-${option.value}`}
                  defaultChecked={override?.optionOverrides[option.value]?.hidden ?? false}
                />
                <span>{t('questions.hideOption')}</span>
              </label>
            </div>
          ))}
        </div>
      )}
      <ErrorLine message={action.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={action.isBusy}>
          {t('questions.saveBuiltin')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('questions.cancel')}
        </Button>
      </div>
    </form>
  );
}

/**
 * Inputs for the questions staff added (RAPP-307), grouped by their screen:
 * on the participant page and on the entity referral form. Uncontrolled, read
 * back with `readCustomAnswers` from the form's FormData.
 */

import { useTranslation } from 'react-i18next';
import {
  textIn,
  YES_NO_MAYBE,
  type CustomAnswers,
  type CustomAnswerValue,
  type CustomQuestion,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const inputClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

const fieldName = (prefix: string, question: CustomQuestion) => `${prefix}-${question.id}`;

/** {question id: value, or null to clear} for every question shown. */
export function readCustomAnswers(
  fields: FormData,
  screens: readonly IntakeScreen[],
  prefix: string,
): Record<string, CustomAnswerValue | null> {
  const answers: Record<string, CustomAnswerValue | null> = {};
  for (const question of screens.flatMap((screen) => screen.questions)) {
    const name = fieldName(prefix, question);
    if (question.type === 'multiple_choice') {
      const chosen = fields
        .getAll(name)
        .filter((value): value is string => typeof value === 'string');
      answers[question.id] = chosen.length === 0 ? null : chosen;
    } else {
      const value = fields.get(name);
      answers[question.id] = typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
    }
  }
  return answers;
}

function QuestionInput({
  question,
  value,
  prefix,
  language,
}: {
  readonly question: CustomQuestion;
  readonly value: CustomAnswerValue | undefined;
  readonly prefix: string;
  readonly language: LanguageCode;
}) {
  const { t } = useTranslation('settings');
  const name = fieldName(prefix, question);
  const label = textIn(question.label, language);
  const help = question.help === null ? '' : textIn(question.help, language);
  const helpId = help === '' ? undefined : `${name}-help`;
  const current = typeof value === 'string' ? value : '';
  // An archived option she chose stays selectable, so saving never drops it.
  const options = question.options.filter(
    (option) =>
      !option.isArchived ||
      option.id === value ||
      (Array.isArray(value) && value.includes(option.id)),
  );

  if (question.type === 'multiple_choice') {
    const chosen = new Set(Array.isArray(value) ? value : []);
    return (
      <fieldset className="flex flex-col gap-1.5" aria-describedby={helpId}>
        <legend className="text-start text-sm font-medium">{label}</legend>
        {options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={option.id}
              defaultChecked={chosen.has(option.id)}
            />
            <span>
              {textIn(option.label, language)}
              {option.isArchived ? ` (${t('questions.archivedOption')})` : ''}
            </span>
          </label>
        ))}
        {helpId === undefined ? null : (
          <p id={helpId} className="text-start text-xs text-muted-foreground">
            {help}
          </p>
        )}
      </fieldset>
    );
  }

  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="text-start">{label}</span>
      {question.type === 'short_text' ? (
        <input
          id={name}
          name={name}
          type="text"
          dir="auto"
          maxLength={500}
          defaultValue={current}
          aria-describedby={helpId}
          className={inputClass}
        />
      ) : question.type === 'long_text' ? (
        <textarea
          id={name}
          name={name}
          dir="auto"
          maxLength={4000}
          rows={3}
          defaultValue={current}
          aria-describedby={helpId}
          className={`${inputClass} h-auto py-2`}
        />
      ) : (
        <select
          id={name}
          name={name}
          defaultValue={current}
          aria-describedby={helpId}
          className={inputClass}
        >
          <option value="">{t('questions.noAnswer')}</option>
          {question.type === 'yes_no_maybe'
            ? YES_NO_MAYBE.map((answer) => (
                <option key={answer} value={answer}>
                  {t(`questions.answers.${answer}`)}
                </option>
              ))
            : options.map((option) => (
                <option key={option.id} value={option.id}>
                  {textIn(option.label, language)}
                  {option.isArchived ? ` (${t('questions.archivedOption')})` : ''}
                </option>
              ))}
        </select>
      )}
      {helpId === undefined ? null : (
        <span id={helpId} className="text-start text-xs font-normal text-muted-foreground">
          {help}
        </span>
      )}
    </label>
  );
}

export function CustomAnswerFields({
  screens,
  values,
  prefix,
  language,
}: {
  readonly screens: readonly IntakeScreen[];
  readonly values: CustomAnswers;
  readonly prefix: string;
  readonly language: LanguageCode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {screens.map((screen) => (
        <fieldset key={screen.id} className="flex flex-col gap-3 rounded-lg border p-3">
          <legend className="px-1 text-start text-sm font-semibold">
            {textIn(screen.title, language)}
          </legend>
          {screen.questions.map((question) => (
            <QuestionInput
              key={question.id}
              question={question}
              value={values[question.id]}
              prefix={prefix}
              language={language}
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}

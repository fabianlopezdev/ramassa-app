/**
 * The input of a question staff added (RAPP-307), on her page (RAPP-653) and
 * on the entity referral form. Uncontrolled, read back with
 * `readCustomAnswersOf` from the form's FormData.
 *
 * Every type has its input (RAPP-610): a number and a date input, yes / no, a
 * phone and an email field, a list of options however long, a list typed one
 * item per line, one consent tick, and the two lists the app ships (every
 * country, every municipality of Catalonia, RAPP-664) by their canonical name,
 * picked with a search (`ListPicker`, RAPP-665). A file or a signature is hers to give, so
 * staff read it and never write it: it is not an input here, and
 * `readCustomAnswersOf` leaves it out.
 */

import { ListPicker } from '@/components/fields/list-picker';
import { useTranslation } from 'react-i18next';
import {
  consentSettings,
  customAnswerMessage,
  dateSettings,
  isStaffWritable,
  itemListSettings,
  LIST_ITEM_MAX_LENGTH,
  LONG_TEXT_MAX_LENGTH,
  normalizeCustomAnswerInput,
  numberSettings,
  SHORT_TEXT_MAX_LENGTH,
  textIn,
  YES_NO,
  YES_NO_MAYBE,
  type AnswerTranslate,
  type CustomAnswerValue,
  type CustomQuestion,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const inputClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

const fieldName = (prefix: string, question: CustomQuestion) => `${prefix}-${question.id}`;

function readOne(
  fields: FormData,
  name: string,
  question: CustomQuestion,
): CustomAnswerValue | null {
  if (question.type === 'multiple_choice') {
    const chosen = fields
      .getAll(name)
      .filter((value): value is string => typeof value === 'string');
    return chosen.length === 0 ? null : chosen;
  }
  if (question.type === 'consent') return fields.get(name) === 'on' ? true : null;
  const raw = fields.get(name);
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text === '') return null;
  switch (question.type) {
    case 'number': {
      const number = Number(text.replace(',', '.'));
      // Not a number stays text, so the check refuses it in words.
      return Number.isFinite(number) ? number : text;
    }
    case 'item_list':
      return normalizeCustomAnswerInput(question, text.split('\n'));
    case 'phone':
    case 'email':
      return normalizeCustomAnswerInput(question, text);
    default:
      return text;
  }
}

/**
 * {question id: message} for each answer that does not fit its question, in
 * the words her wizard uses (RAPP-610). An empty answer is not checked here.
 */
export function customAnswerErrorsOf(
  questions: readonly CustomQuestion[],
  answers: Readonly<Record<string, CustomAnswerValue | null>>,
  t: AnswerTranslate,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const question of questions) {
    const value = answers[question.id];
    const message = value == null ? undefined : customAnswerMessage(question, value, t);
    if (message !== undefined) errors[question.id] = message;
  }
  return errors;
}

/** {question id: value, or null to clear} for every question staff may write. */
export function readCustomAnswersOf(
  fields: FormData,
  questions: readonly CustomQuestion[],
  prefix: string,
): Record<string, CustomAnswerValue | null> {
  const answers: Record<string, CustomAnswerValue | null> = {};
  for (const question of questions) {
    if (!isStaffWritable(question)) continue;
    answers[question.id] = readOne(fields, fieldName(prefix, question), question);
  }
  return answers;
}

/** One question's input, also drawn alone in the entity form's order (RAPP-652). */
export function CustomAnswerInput({
  question,
  value,
  prefix,
  language,
  error,
  isRequired = false,
  inputClassName = inputClass,
}: {
  readonly question: CustomQuestion;
  readonly value: CustomAnswerValue | undefined;
  readonly prefix: string;
  readonly language: LanguageCode;
  /** What does not fit, in the words her wizard uses (RAPP-610). */
  readonly error?: string;
  /** Marked with an asterisk; the form checks it on sending. */
  readonly isRequired?: boolean;
  /** The text inputs' and list's look, to match the form around them. */
  readonly inputClassName?: string;
}) {
  // Its words follow the form's language, as the entity form's preview shows it (RAPP-652).
  const { t } = useTranslation('settings', { lng: language });
  const name = fieldName(prefix, question);
  const label = `${textIn(question.label, language)}${isRequired ? ' *' : ''}`;
  const help = question.help === null ? '' : textIn(question.help, language);
  const helpId = help === '' ? undefined : `${name}-help`;
  const current =
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  const chosenIds = Array.isArray(value)
    ? (value as readonly unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  // An archived option she chose stays selectable, so saving never drops it.
  const options = question.options.filter(
    (option) => !option.isArchived || option.id === value || chosenIds.includes(option.id),
  );
  const errorLine =
    error === undefined ? null : (
      <span
        role="alert"
        className="text-start text-xs font-normal text-destructive"
        data-testid={`${name}-error`}
      >
        {error}
      </span>
    );
  const helpLine =
    helpId === undefined ? null : (
      <span id={helpId} className="text-start text-xs font-normal text-muted-foreground">
        {help}
      </span>
    );

  if (!isStaffWritable(question)) {
    return (
      <p className="text-start text-sm text-muted-foreground" data-testid={`${name}-hers`}>
        {label}: {t('questions.answers.hersOnly')}
      </p>
    );
  }

  if (question.type === 'multiple_choice') {
    const chosen = new Set(chosenIds);
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
        {helpLine}
        {errorLine}
      </fieldset>
    );
  }

  if (question.type === 'consent') {
    return (
      <fieldset className="flex flex-col gap-1.5" aria-describedby={helpId}>
        <legend className="text-start text-sm font-medium">{label}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={name} defaultChecked={value === true} />
          <span>{textIn(consentSettings(question.settings).text, language)}</span>
        </label>
        {helpLine}
        {errorLine}
      </fieldset>
    );
  }

  const number = numberSettings(question.settings);
  const control = (() => {
    switch (question.type) {
      case 'short_text':
        return (
          <input
            id={name}
            name={name}
            type="text"
            dir="auto"
            maxLength={SHORT_TEXT_MAX_LENGTH}
            defaultValue={current}
            aria-describedby={helpId}
            aria-required={isRequired}
            className={inputClassName}
          />
        );
      case 'long_text':
      case 'item_list':
        return (
          <textarea
            id={name}
            name={name}
            dir="auto"
            maxLength={
              question.type === 'long_text'
                ? LONG_TEXT_MAX_LENGTH
                : itemListSettings(question.settings).max_items * (LIST_ITEM_MAX_LENGTH + 1)
            }
            rows={3}
            defaultValue={question.type === 'item_list' ? chosenIds.join('\n') : current}
            aria-describedby={helpId}
            placeholder={
              question.type === 'item_list' ? t('questions.answers.onePerLine') : undefined
            }
            className={`${inputClassName} h-auto py-2`}
          />
        );
      case 'number':
        return (
          <input
            id={name}
            name={name}
            type="number"
            step={number.integer ? '1' : 'any'}
            min={number.min}
            max={number.max}
            defaultValue={current}
            aria-describedby={helpId}
            aria-required={isRequired}
            className={inputClassName}
          />
        );
      case 'date': {
        const ages = dateSettings(question.settings);
        return (
          <input
            id={name}
            name={name}
            type="date"
            defaultValue={current}
            aria-describedby={helpId}
            data-min-age={ages.min_age}
            data-max-age={ages.max_age}
            className={inputClassName}
          />
        );
      }
      case 'phone':
      case 'email':
        return (
          <input
            id={name}
            name={name}
            type={question.type === 'phone' ? 'tel' : 'email'}
            dir="ltr"
            defaultValue={current}
            aria-describedby={helpId}
            aria-required={isRequired}
            className={inputClassName}
          />
        );
      case 'country':
      case 'municipality':
        return (
          <ListPicker
            kind={question.type}
            language={language}
            id={name}
            name={name}
            value={current}
            noneLabel={t('questions.noAnswer')}
            isRequired={isRequired}
            describedBy={helpId}
            className={inputClassName}
            testId={`${name}-list`}
          />
        );
      default:
        return (
          <select
            id={name}
            name={name}
            defaultValue={current}
            aria-describedby={helpId}
            aria-required={isRequired}
            className={inputClassName}
          >
            <option value="">{t('questions.noAnswer')}</option>
            {question.type === 'yes_no_maybe' || question.type === 'yes_no'
              ? (question.type === 'yes_no' ? YES_NO : YES_NO_MAYBE).map((answer) => (
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
        );
    }
  })();

  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="text-start">{label}</span>
      {control}
      {helpLine}
      {errorLine}
    </label>
  );
}

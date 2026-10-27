/**
 * What a question type needs in the builder (RAPP-610): a plain-language line
 * that says what each type asks, the settings of the chosen type, and a live
 * preview of her phone's control in each language, right to left in Arabic and
 * Farsi.
 *
 * The settings are uncontrolled inputs, read back by `readQuestionSettings`
 * from the form's FormData, as the rest of the question form. The preview is
 * rebuilt from the form on every change (`readPreviewDraft`).
 */

import { textFromForm } from '@/components/fields/language-fields';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getCountryOptions } from '@ramassa/shared/i18n/countries';
import {
  getLanguageDirection,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
} from '@ramassa/shared/i18n/languages';
import { getMunicipalityOptions } from '@ramassa/shared/i18n/municipalities';
import {
  dateSettings,
  fileSettings,
  itemListSettings,
  LIST_DEFAULT_MAX_ITEMS,
  LIST_MAX_ITEMS,
  LONG_TEXT_MAX_LENGTH,
  numberSettings,
  textIn,
  type BuilderText,
  type CustomQuestionType,
  type QuestionSettings,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const inputClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

function numberFrom(fields: FormData, name: string): number | undefined {
  const raw = fields.get(name);
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * The settings of a type as typed in the form. A number that does not parse
 * stays NaN, so the shared schema refuses it with the settings message.
 */
export function readQuestionSettings(fields: FormData, type: CustomQuestionType): QuestionSettings {
  const optional = (name: string) => {
    const value = numberFrom(fields, name);
    return value === undefined ? {} : { [name.replace('setting-', '').replace('-', '_')]: value };
  };
  switch (type) {
    case 'number':
      return {
        integer: fields.get('setting-integer') === 'on',
        ...optional('setting-min'),
        ...optional('setting-max'),
      };
    case 'date':
      return { ...optional('setting-min-age'), ...optional('setting-max-age') };
    case 'item_list':
      return { max_items: numberFrom(fields, 'setting-max-items') ?? LIST_DEFAULT_MAX_ITEMS };
    case 'file_upload':
      return { accept: fields.get('setting-accept') === 'photo' ? 'photo' : 'document' };
    default:
      return {};
  }
}

/** One option per line, pasted from a spreadsheet: a long list in one go. */
export function pastedOptions(fields: FormData): readonly string[] {
  const raw = fields.get('options-paste');
  if (typeof raw !== 'string') return [];
  return [
    ...new Set(
      raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    ),
  ];
}

export function TypeDescription({ type }: { readonly type: CustomQuestionType }) {
  const { t } = useTranslation('settings');
  return (
    <span
      className="text-start text-xs font-normal text-muted-foreground"
      data-testid="type-description"
    >
      {t(`questions.typeHelp.${type}`)}
    </span>
  );
}

function NumberInput({
  name,
  label,
  defaultValue,
  step = 'any',
  min,
  max,
}: {
  readonly name: string;
  readonly label: string;
  readonly defaultValue: number | undefined;
  readonly step?: string;
  readonly min?: number;
  readonly max?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      <span className="text-start">{label}</span>
      <input
        type="number"
        name={name}
        step={step}
        min={min}
        max={max}
        defaultValue={defaultValue ?? ''}
        className={inputClass}
      />
    </label>
  );
}

export function QuestionSettingsFields({
  type,
  settings,
  uploadsAvailable,
}: {
  readonly type: CustomQuestionType;
  readonly settings: QuestionSettings | undefined;
  /** False when this deployment has no media service: file answers cannot be stored. */
  readonly uploadsAvailable: boolean;
}) {
  const { t } = useTranslation('settings');
  const current = settings ?? {};
  switch (type) {
    case 'number': {
      const number = numberSettings(current);
      return (
        <fieldset
          className="flex flex-col gap-2 rounded-lg border p-3"
          data-testid="settings-number"
        >
          <legend className="px-1 text-start text-sm font-medium">
            {t('questions.settings.title')}
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="setting-integer" defaultChecked={number.integer} />
            <span>{t('questions.settings.integer')}</span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <NumberInput
              name="setting-min"
              label={t('questions.settings.min')}
              defaultValue={number.min}
            />
            <NumberInput
              name="setting-max"
              label={t('questions.settings.max')}
              defaultValue={number.max}
            />
          </div>
        </fieldset>
      );
    }
    case 'date': {
      const date = dateSettings(current);
      return (
        <fieldset className="flex flex-col gap-2 rounded-lg border p-3" data-testid="settings-date">
          <legend className="px-1 text-start text-sm font-medium">
            {t('questions.settings.title')}
          </legend>
          <p className="text-start text-xs text-muted-foreground">
            {t('questions.settings.ageHint')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <NumberInput
              name="setting-min-age"
              label={t('questions.settings.minAge')}
              defaultValue={date.min_age}
              step="1"
              min={0}
              max={120}
            />
            <NumberInput
              name="setting-max-age"
              label={t('questions.settings.maxAge')}
              defaultValue={date.max_age}
              step="1"
              min={0}
              max={120}
            />
          </div>
        </fieldset>
      );
    }
    case 'item_list':
      return (
        <fieldset className="flex flex-col gap-2 rounded-lg border p-3" data-testid="settings-list">
          <legend className="px-1 text-start text-sm font-medium">
            {t('questions.settings.title')}
          </legend>
          <NumberInput
            name="setting-max-items"
            label={t('questions.settings.maxItems')}
            defaultValue={itemListSettings(current).max_items}
            step="1"
            min={1}
            max={LIST_MAX_ITEMS}
          />
        </fieldset>
      );
    case 'file_upload':
      return (
        <fieldset className="flex flex-col gap-2 rounded-lg border p-3" data-testid="settings-file">
          <legend className="px-1 text-start text-sm font-medium">
            {t('questions.settings.title')}
          </legend>
          <label className="flex max-w-sm flex-col gap-1 text-xs font-medium">
            <span className="text-start">{t('questions.settings.accept')}</span>
            <select
              name="setting-accept"
              defaultValue={fileSettings(current).accept}
              className={inputClass}
            >
              <option value="document">{t('questions.settings.acceptDocument')}</option>
              <option value="photo">{t('questions.settings.acceptPhoto')}</option>
            </select>
          </label>
          <p className="text-start text-xs text-muted-foreground">
            {t('questions.settings.filePrivacy')}
          </p>
          {uploadsAvailable ? null : (
            <p
              role="alert"
              className="text-start text-sm text-destructive"
              data-testid="uploads-unavailable"
            >
              {t('questions.settings.uploadsUnavailable')}
            </p>
          )}
        </fieldset>
      );
    case 'search_choice':
      return (
        <label className="flex flex-col gap-1 text-sm font-medium" data-testid="settings-paste">
          <span className="text-start">{t('questions.settings.pasteOptions')}</span>
          <textarea name="options-paste" rows={4} className={`${inputClass} h-auto py-2`} />
          <span className="text-start text-xs font-normal text-muted-foreground">
            {t('questions.settings.pasteHint')}
          </span>
        </label>
      );
    default:
      return null;
  }
}

/** What the preview shows, read from the form. */
export interface PreviewDraft {
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText;
  readonly settings: QuestionSettings;
  readonly options: readonly BuilderText[];
  /**
   * How her phone lays out a choice (RAPP-712). A question staff add shows a
   * grid of two columns; a screen of the app's own can show one card per row
   * (her document type, her languages) or a grid of three (her sizes).
   */
  readonly look?: 'cards' | 'grid';
}

export function readPreviewDraft(
  form: HTMLFormElement,
  type: CustomQuestionType,
  optionNames: readonly string[],
): PreviewDraft {
  const fields = new FormData(form);
  return {
    type,
    label: textFromForm(fields, 'question-label'),
    help: textFromForm(fields, 'question-help'),
    settings: readQuestionSettings(fields, type),
    options: [
      ...optionNames.map((name) => textFromForm(fields, name)),
      ...pastedOptions(fields).map((ca) => ({ ca })),
    ].filter((label) => Object.keys(label).length > 0),
  };
}

// Her phone's controls, drawn at the phone frame's scale (RAPP-704, RAPP-712).
// A field: white, a navy border, her finger's height, the placeholder in grey.
const fieldClass =
  'flex min-h-11 w-full min-w-0 items-center rounded-md border border-primary bg-white px-3 py-2 text-start text-sm text-foreground';
const placeholderClass = 'text-muted-foreground';
// A choice, a card or an action: the app's raised surface, a navy edge under it
// on the end side, yellow when chosen.
const raisedClass =
  'flex min-h-11 min-w-0 items-center rounded-md border border-primary bg-white px-4 py-2 text-sm text-primary shadow-[2px_3px_0_0_var(--color-primary)] rtl:shadow-[-2px_3px_0_0_var(--color-primary)]';
const chosenClass = 'bg-secondary text-foreground';
const subLabelClass = 'text-start text-sm font-medium';
const GRID_COLUMNS = ['grid-cols-1', 'grid-cols-2', 'grid-cols-3'] as const;

/** The app's choice grid: equal cells, at most two columns, or three for yes, no and maybe. */
function ChoiceGrid({
  labels,
  maximumColumns,
  chosen,
}: {
  readonly labels: readonly string[];
  readonly maximumColumns: 2 | 3;
  readonly chosen: ReadonlySet<number>;
}) {
  const columns = Math.min(maximumColumns, Math.max(1, labels.length));
  return (
    <div className={cn('grid gap-2 pe-0.5 pb-1', GRID_COLUMNS[columns - 1])}>
      {labels.map((label, index) => (
        <span
          key={index}
          className={cn(
            raisedClass,
            'justify-center text-center',
            chosen.has(index) && chosenClass,
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/** The app's choice cards: one per row, her words at the start, a tick at the end when chosen. */
function ChoiceCards({
  labels,
  chosen,
}: {
  readonly labels: readonly string[];
  readonly chosen: ReadonlySet<number>;
}) {
  return (
    <div className="flex flex-col gap-2 pe-0.5 pb-1">
      {labels.map((label, index) => (
        <span
          key={index}
          className={cn(raisedClass, 'justify-between gap-2', chosen.has(index) && chosenClass)}
        >
          <span className="min-w-0 flex-1 text-start">{label}</span>
          {chosen.has(index) ? (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-4 shrink-0 text-primary"
              fill="none"
            >
              <path
                d="M4 12.5 9.5 18 21 6"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/** A field with her words, or the app's placeholder in grey, or nothing. */
function Field({
  text,
  placeholder,
  className,
}: {
  readonly text?: string;
  readonly placeholder?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn(fieldClass, className)}>
      {text === undefined ? (
        <span className={cn('truncate', placeholderClass)}>{placeholder ?? ' '}</span>
      ) : (
        <span className="truncate">{text}</span>
      )}
    </div>
  );
}

/**
 * Her phone's control for this question, in one language, laid out as the app
 * lays it out (RAPP-712): the same fields, choice grids and cards, raised
 * buttons and the app's own words (Day, Month, Year, Add, Sign here) in that
 * language. The screen editors, the board cards and the type picker all draw
 * an answer with it, so they never differ. In the board's phone a searchable
 * list shows its field without the option count.
 *
 * `isExample` draws it answered, with sample words in that language, for the
 * type picker (RAPP-646): a filled field, chosen options, an added item, so
 * each type reads apart at a glance.
 */
export function QuestionControl({
  draft,
  language,
  showOptionCount = true,
  isExample = false,
}: {
  readonly draft: PreviewDraft;
  readonly language: LanguageCode;
  readonly showOptionCount?: boolean;
  readonly isExample?: boolean;
}) {
  const { t } = useTranslation(['settings', 'onboarding', 'common']);
  const phone = (key: string, values: Record<string, unknown> = {}) =>
    t(`onboarding:${key}`, { ...values, lng: language });
  const sample = (key: string) => t(`settings:questions.typeSamples.${key}`, { lng: language });
  const nothing = new Set<number>();
  switch (draft.type) {
    case 'short_text':
      return <Field text={isExample ? sample('shortText') : undefined} />;
    case 'email':
      return <Field text={isExample ? sample('email') : undefined} />;
    case 'phone':
      return <Field placeholder={<bdi dir="ltr">{phone('phonePlaceholder')}</bdi>} />;
    case 'number':
      return <Field text={isExample ? sample('number') : undefined} />;
    case 'long_text':
      // The app's writing area, tall, with her character count under it.
      return (
        <div className="flex flex-col gap-1.5">
          <div className={cn(fieldClass, 'h-32 items-start')}>
            {isExample ? <span className="line-clamp-4">{sample('longText')}</span> : null}
          </div>
          <span className="text-start text-xs text-muted-foreground tabular-nums">
            {t('common:characterCount', {
              count: isExample ? sample('longText').length : 0,
              limit: LONG_TEXT_MAX_LENGTH,
              lng: language,
            })}
          </span>
        </div>
      );
    case 'date':
      // Day, month and year: three fields, each named above its box.
      return (
        <div className="grid grid-cols-3 gap-2">
          {['dayLabel', 'monthLabel', 'yearLabel'].map((key) => (
            <div key={key} className="flex min-w-0 flex-col gap-1">
              <span className={cn(subLabelClass, 'truncate')}>{phone(key)}</span>
              <Field />
            </div>
          ))}
        </div>
      );
    case 'yes_no':
    case 'yes_no_maybe':
      return (
        <ChoiceGrid
          labels={(draft.type === 'yes_no'
            ? ['yesOption', 'noOption']
            : ['yesOption', 'noOption', 'customMaybeOption']
          ).map((key) => phone(key))}
          maximumColumns={3}
          chosen={isExample ? new Set([0]) : nothing}
        />
      );
    case 'single_choice':
    case 'multiple_choice': {
      const labels = draft.options.map((option) => textIn(option, language));
      const chosen = isExample ? new Set(draft.type === 'multiple_choice' ? [0, 2] : [0]) : nothing;
      return draft.look === 'cards' ? (
        <ChoiceCards labels={labels} chosen={chosen} />
      ) : (
        <ChoiceGrid
          labels={labels}
          maximumColumns={draft.look === 'grid' ? 3 : 2}
          chosen={chosen}
        />
      );
    }
    case 'search_choice':
    case 'country':
    case 'municipality': {
      // One field that opens the app's search sheet: her list, the chosen row in navy.
      const list =
        draft.type === 'country'
          ? getCountryOptions(language).map((option) => option.label)
          : draft.type === 'municipality'
            ? getMunicipalityOptions(language).map((option) => option.label)
            : draft.options.map((option) => textIn(option, language));
      const placeholder = phone(
        draft.type === 'country'
          ? 'searchCountryPlaceholder'
          : draft.type === 'municipality'
            ? 'searchMunicipalityPlaceholder'
            : 'customSearchPlaceholder',
      );
      return (
        <div className="flex flex-col gap-1">
          <Field placeholder={placeholder} />
          {isExample ? (
            list.slice(0, 2).map((label, index) => (
              <span
                key={index}
                className={cn(
                  'truncate rounded-lg px-3 py-1.5 text-start text-sm',
                  index === 0 && 'bg-primary font-medium text-primary-foreground',
                )}
              >
                {label}
              </span>
            ))
          ) : showOptionCount ? (
            <span className="text-start text-xs text-muted-foreground">
              {t('settings:questions.preview.optionCount', { count: list.length })}
            </span>
          ) : null}
        </div>
      );
    }
    case 'item_list':
      // The supporting organizations list: a named field, Add beside it, then her items.
      return (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex flex-col gap-1">
            <span className={subLabelClass}>{phone('customListItemLabel')}</span>
            <div className="flex items-center gap-2">
              <Field className="flex-1" />
              <span className={cn(raisedClass, 'shrink-0 justify-center')}>
                {phone('supportingEntitiesAddAction')}
              </span>
            </div>
          </div>
          {isExample ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-(--ramassa-color-neutral-200) bg-(--ramassa-color-neutral-50) px-3 py-2 text-sm">
              <span className="truncate text-start">{sample('listItem')}</span>
              <span aria-hidden className="text-lg leading-none font-medium text-primary">
                ×
              </span>
            </div>
          ) : null}
        </div>
      );
    case 'file_upload':
      // Raised buttons: a photo, and a document when the question takes one.
      return (
        <div className="flex flex-wrap gap-2 pe-0.5 pb-1">
          <span className={cn(raisedClass, 'justify-center')}>{phone('customChoosePhoto')}</span>
          {fileSettings(draft.settings).accept === 'document' ? (
            <span className={cn(raisedClass, 'justify-center')}>
              {phone('customChooseDocument')}
            </span>
          ) : null}
        </div>
      );
  }
}

export function QuestionPreview({
  draft,
  language,
  onLanguageChange,
}: {
  readonly draft: PreviewDraft;
  readonly language: LanguageCode;
  readonly onLanguageChange: (language: LanguageCode) => void;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const direction = getLanguageDirection(language);
  const label = textIn(draft.label, language);
  const help = textIn(draft.help, language);
  const usesCatalan =
    (draft.label[language] ?? '').trim() === '' && (draft.label.ca ?? '').trim() !== '';

  return (
    <aside
      className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4"
      aria-label={t('settings:questions.preview.title')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-start text-sm font-semibold">
          {t('settings:questions.preview.title')}
        </h4>
        <select
          aria-label={t('settings:questions.preview.language')}
          data-testid="question-preview-language"
          value={language}
          onChange={(event) => onLanguageChange(event.target.value as LanguageCode)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {SUPPORTED_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NATIVE_NAMES[code]}
            </option>
          ))}
        </select>
      </div>
      {usesCatalan ? (
        <p
          className="text-start text-xs text-muted-foreground"
          data-testid="question-preview-fallback"
        >
          {t('settings:questions.preview.fallback')}
        </p>
      ) : null}
      <div
        lang={language}
        dir={direction}
        className="flex flex-col gap-2 rounded-lg border bg-background p-4"
        data-testid="question-preview"
      >
        <p className="text-start text-sm font-medium" data-testid="question-preview-label">
          {label === '' ? ' ' : label}
        </p>
        {help === '' ? null : <p className="text-start text-xs text-muted-foreground">{help}</p>}
        <QuestionControl draft={draft} language={language} />
      </div>
    </aside>
  );
}

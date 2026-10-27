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

// The phone's own field (RAPP-704): white, a navy border, her finger's height.
const boxClass =
  'flex min-h-10 items-center rounded-lg border border-primary bg-white px-3 py-2 text-sm text-muted-foreground';
const chipClass = 'rounded-full border px-3 py-1 text-sm';
/** A filled answer in the type picker's pictures (RAPP-646): her words in the box. */
const filledClass = 'text-foreground';
const chosenChipClass = 'border-primary bg-primary/10 text-foreground';

/** The mark a chosen chip carries in a picture: a dot for one option, a tick for several. */
function ChoiceMark({
  isMultiple,
  isChosen,
}: {
  readonly isMultiple: boolean;
  readonly isChosen: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-3.5 shrink-0 items-center justify-center border-[1.5px]',
        isMultiple ? 'rounded-[3px]' : 'rounded-full',
        isChosen ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
      )}
    >
      {isChosen ? (
        isMultiple ? (
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none">
            <path
              d="M2.5 6.2 5 8.5l4.5-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span className="size-1.5 rounded-full bg-primary-foreground" />
        )
      ) : null}
    </span>
  );
}

/**
 * Her phone's control for this question, in one language: the same parts
 * and the app's own words (Day, Month, Year, Add, Sign here) in that language.
 * The registration board's phone preview (RAPP-641) draws its questions with
 * it too; there a searchable list shows its box without the option count.
 *
 * `isExample` draws it answered, with sample words in that language, for the
 * type picker (RAPP-646): a filled box, chosen options, an added item and a
 * ticked consent, so each type reads apart at a glance.
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
  const { t } = useTranslation(['settings', 'onboarding']);
  const phone = (key: string, values: Record<string, unknown> = {}) =>
    t(`onboarding:${key}`, { ...values, lng: language });
  const sample = (key: string) => t(`settings:questions.typeSamples.${key}`, { lng: language });
  const number = numberSettings(draft.settings);
  switch (draft.type) {
    case 'short_text':
    case 'phone':
    case 'email':
      return (
        <div className={cn(boxClass, isExample && `${filledClass} truncate`)}>
          {draft.type === 'phone' ? (
            <bdi dir="ltr">{phone('phonePlaceholder')}</bdi>
          ) : isExample ? (
            draft.type === 'email' ? (
              <bdi dir="ltr">{sample('email')}</bdi>
            ) : (
              sample('shortText')
            )
          ) : (
            ' '
          )}
        </div>
      );
    case 'long_text':
      return (
        <div className={cn(boxClass, 'h-16', isExample && `${filledClass} line-clamp-3`)}>
          {isExample ? sample('longText') : null}
        </div>
      );
    case 'number':
      return (
        <div className={cn(boxClass, isExample && filledClass)}>
          {isExample
            ? sample('number')
            : number.min !== undefined || number.max !== undefined
              ? `${number.min ?? ''}-${number.max ?? ''}`
              : ' '}
        </div>
      );
    case 'date':
      return (
        <div className="grid grid-cols-3 gap-2">
          {['dayLabel', 'monthLabel', 'yearLabel'].map((key) => (
            <div key={key} className={boxClass}>
              {phone(key)}
            </div>
          ))}
        </div>
      );
    case 'yes_no':
    case 'yes_no_maybe':
      return (
        <div className="flex flex-wrap gap-2">
          {(draft.type === 'yes_no'
            ? ['yesOption', 'noOption']
            : ['yesOption', 'noOption', 'customMaybeOption']
          ).map((key, index) => (
            <span key={key} className={cn(chipClass, isExample && index === 0 && chosenChipClass)}>
              {phone(key)}
            </span>
          ))}
        </div>
      );
    case 'single_choice':
    case 'multiple_choice': {
      const isMultiple = draft.type === 'multiple_choice';
      return (
        <div className="flex flex-wrap gap-2">
          {draft.options.map((option, index) => {
            const isChosen = isExample && (index === 0 || (isMultiple && index === 2));
            return (
              <span
                key={index}
                className={cn(
                  chipClass,
                  isExample && 'inline-flex items-center gap-1.5',
                  isChosen && chosenChipClass,
                )}
              >
                {isExample ? <ChoiceMark isMultiple={isMultiple} isChosen={isChosen} /> : null}
                {textIn(option, language)}
              </span>
            );
          })}
        </div>
      );
    }
    case 'search_choice':
      return (
        <div className="flex flex-col gap-1">
          <div className={boxClass}>{phone('customSearchPlaceholder')}</div>
          {isExample ? (
            draft.options.map((option, index) => (
              <div key={index} className="rounded-md border px-3 py-1.5 text-start text-sm">
                {textIn(option, language)}
              </div>
            ))
          ) : showOptionCount ? (
            <span className="text-xs text-muted-foreground">
              {t('settings:questions.preview.optionCount', { count: draft.options.length })}
            </span>
          ) : null}
        </div>
      );
    case 'country':
    case 'municipality': {
      // The lists the app ships (D6): she searches every country, or every municipality.
      const list =
        draft.type === 'country' ? getCountryOptions(language) : getMunicipalityOptions(language);
      return (
        <div className="flex flex-col gap-1">
          <div className={boxClass}>{phone('customSearchPlaceholder')}</div>
          {isExample ? (
            list.slice(0, 2).map((option) => (
              <div key={option.code} className="rounded-md border px-3 py-1.5 text-start text-sm">
                {option.label}
              </div>
            ))
          ) : showOptionCount ? (
            <span className="text-xs text-muted-foreground">
              {t('settings:questions.preview.optionCount', { count: list.length })}
            </span>
          ) : null}
        </div>
      );
    }
    case 'item_list':
      return (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className={cn(boxClass, 'flex-1', isExample && 'min-w-0 truncate')}>
              {phone('customListItemLabel')}
            </div>
            <span className={chipClass}>{phone('supportingEntitiesAddAction')}</span>
          </div>
          {isExample ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm">
              <span className="truncate text-start">{sample('listItem')}</span>
              <span aria-hidden className="text-primary">
                ×
              </span>
            </div>
          ) : null}
        </div>
      );
    case 'file_upload':
      return (
        <div className="flex flex-wrap gap-2">
          <span className={chipClass}>{phone('customChoosePhoto')}</span>
          {fileSettings(draft.settings).accept === 'document' ? (
            <span className={chipClass}>{phone('customChooseDocument')}</span>
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

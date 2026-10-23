/**
 * The question builder (RAPP-307), in Settings for settings.organization.
 *
 * Staff build registration screens of their own, each placed after one of the
 * built-in wizard steps, and fill them with questions: short text, long text,
 * yes/no/maybe, single or multiple choice. Each question says where it shows
 * (her wizard, the entity referral form, every season, staff only) and how
 * private its answer is. Type and privacy are set once, so the form locks them
 * on an existing question and says why. A removed option is archived and the
 * answers that chose it keep it.
 *
 * Built-in questions are reworded here too: label, help, option labels, and
 * hidden options. A question the app needs cannot be hidden, and the form says
 * why. Forms are uncontrolled and read with FormData.
 */

import {
  pastedOptions,
  QuestionPreview,
  QuestionSettingsFields,
  readPreviewDraft,
  readQuestionSettings,
  TypeDescription,
  TypeGuide,
  type PreviewDraft,
} from '@/components/settings/question-type-fields';
import { RequiredSwitch } from '@/components/settings/required-switch';
import { Button } from '@/components/ui/button';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessageKey, isAppError } from '@ramassa/shared/errors';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import {
  isRequiredQuestion,
  type IntakeQuestion,
  type RequiredQuestions,
} from '@ramassa/shared/intake';
import {
  BUILTIN_SCREENS,
  builtinHideLock,
  builtinRequiredLock,
  canHideBuiltin,
  canRequireCustomQuestion,
  CUSTOM_QUESTION_TYPES,
  isChoiceType,
  isCustomQuestionRequired,
  liveOptions,
  overrideFor,
  placementsAllowedFor,
  QUESTION_PLACEMENTS,
  QUESTION_PRIVACY_LEVELS,
  questionDraftSchema,
  requiredBuiltinQuestions,
  textIn,
  type BuilderText,
  type BuiltinOverride,
  type BuiltinScreen,
  type CustomQuestion,
  type CustomQuestionType,
  type IntakeCatalog,
  type IntakeScreen,
  type QuestionDraft,
  type QuestionPlacement,
  type QuestionPrivacy,
  type ScreenDraft,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface BuiltinQuestionInfo {
  readonly question: IntakeQuestion;
  /** The app's own label, in the staff member's language. */
  readonly label: string;
  /** The options staff may relabel or hide; none for a picker list. */
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface QuestionBuilderProps {
  readonly catalog: IntakeCatalog;
  readonly builtins: readonly BuiltinQuestionInfo[];
  readonly onSaveScreen: (draft: ScreenDraft) => Promise<void>;
  readonly onArchiveScreen: (id: string) => Promise<void>;
  readonly onReorderScreens: (afterScreen: BuiltinScreen, ids: readonly string[]) => Promise<void>;
  readonly onSaveQuestion: (draft: QuestionDraft) => Promise<void>;
  readonly onArchiveQuestion: (id: string) => Promise<void>;
  readonly onReorderQuestions: (screenId: string, ids: readonly string[]) => Promise<void>;
  readonly onSaveBuiltin: (override: BuiltinOverride) => Promise<void>;
  /** Make a built-in question required or optional (RAPP-611). */
  readonly onSaveBuiltinRequired: (question: IntakeQuestion, isRequired: boolean) => Promise<void>;
  /** Make a staff question required or optional where she answers it (RAPP-611). */
  readonly onSaveCustomRequired: (questionId: string, isRequired: boolean) => Promise<void>;
  /**
   * Whether this deployment stores files (a media service is set up). A file
   * question warns staff when it does not (RAPP-610).
   */
  readonly canStoreFiles?: boolean;
}

type Editing =
  | { readonly kind: 'screen'; readonly screen: IntakeScreen | null }
  | {
      readonly kind: 'question';
      readonly screenId: string;
      readonly question: CustomQuestion | null;
    }
  | { readonly kind: 'builtin'; readonly question: IntakeQuestion }
  | null;

const inputClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

/** Reads `<name>.<language>` inputs back into localized text. */
function textFromForm(fields: FormData, name: string): BuilderText {
  return Object.fromEntries(
    SUPPORTED_LANGUAGES.flatMap((language) => {
      const value = fields.get(`${name}.${language}`);
      return typeof value === 'string' && value.trim() !== '' ? [[language, value.trim()]] : [];
    }),
  ) as BuilderText;
}

/**
 * The language a screen editor writes in (RAPP-641). Inside it the forms show
 * one box per text, in that language; the other languages stay in the form,
 * hidden, so FormData still reads all five.
 */
export const EditingLanguageContext = createContext<LanguageCode | null>(null);

function LanguageFields({
  name,
  legend,
  value,
  isCatalanRequired,
  isLong = false,
}: {
  readonly name: string;
  readonly legend: string;
  readonly value: BuilderText | null | undefined;
  readonly isCatalanRequired: boolean;
  readonly isLong?: boolean;
}) {
  const { t } = useTranslation('settings');
  const editing = useContext(EditingLanguageContext);
  if (editing !== null) {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${name}.${editing}`} className="text-start text-sm font-medium">
          {legend}
          {editing === 'ca' && isCatalanRequired ? (
            <span className="text-muted-foreground"> ({t('questions.required')})</span>
          ) : null}
        </label>
        {SUPPORTED_LANGUAGES.map((language) => {
          const id = `${name}.${language}`;
          const shared = {
            id,
            name: id,
            defaultValue: value?.[language] ?? '',
            dir: language === 'ar' || language === 'fa' ? 'rtl' : 'auto',
            lang: language,
            hidden: language !== editing,
            className: isLong ? `${inputClass} h-auto min-h-16 py-2` : inputClass,
          } as const;
          return isLong ? (
            <textarea key={language} {...shared} rows={2} />
          ) : (
            <input key={language} {...shared} type="text" />
          );
        })}
      </div>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
      <legend className="px-1 text-start text-sm font-medium">{legend}</legend>
      {SUPPORTED_LANGUAGES.map((language) => {
        const id = `${name}.${language}`;
        const label = `${LANGUAGE_NATIVE_NAMES[language]}${
          language === 'ca' && isCatalanRequired ? ` (${t('questions.required')})` : ''
        }`;
        const shared = {
          id,
          name: id,
          defaultValue: value?.[language] ?? '',
          dir: language === 'ar' || language === 'fa' ? 'rtl' : 'auto',
          lang: language,
          required: language === 'ca' && isCatalanRequired,
          className: isLong ? `${inputClass} h-auto min-h-16 py-2` : inputClass,
        } as const;
        return (
          <label key={language} htmlFor={id} className="flex flex-col gap-1 text-xs font-medium">
            <span className="text-start">{label}</span>
            {isLong ? <textarea {...shared} rows={2} /> : <input {...shared} type="text" />}
          </label>
        );
      })}
    </fieldset>
  );
}

export function ErrorLine({ message }: { readonly message: string | null }) {
  return message === null ? null : (
    <p aria-live="polite" className="text-start text-sm text-destructive">
      {message}
    </p>
  );
}

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

function ScreenForm({
  screen,
  onSave,
  onCancel,
}: {
  readonly screen: IntakeScreen | null;
  readonly onSave: (draft: ScreenDraft) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const action = useAction();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const title = textFromForm(fields, 'screen-title');
    if ((title.ca ?? '') === '') {
      action.setError(t('settings:questions.catalanNeeded'));
      return;
    }
    const intro = textFromForm(fields, 'screen-intro');
    if (
      await action.run(() =>
        onSave({
          id: screen?.id ?? null,
          title,
          intro: Object.keys(intro).length === 0 ? null : intro,
          afterScreen: fields.get('screen-after') as BuiltinScreen,
        }),
      )
    ) {
      onCancel();
    }
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
      data-testid="screen-form"
      onSubmit={(event) => void submit(event)}
    >
      <h3 className="text-start font-semibold">
        {screen === null ? t('settings:questions.newScreen') : t('settings:questions.editScreen')}
      </h3>
      <LanguageFields
        name="screen-title"
        legend={t('settings:questions.screenTitle')}
        value={screen?.title}
        isCatalanRequired
      />
      <LanguageFields
        name="screen-intro"
        legend={t('settings:questions.screenIntro')}
        value={screen?.intro}
        isCatalanRequired={false}
        isLong
      />
      <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium">
        <span>{t('settings:questions.afterStep')}</span>
        <select
          name="screen-after"
          defaultValue={screen?.afterScreen ?? 'logistics'}
          className={inputClass}
        >
          {BUILTIN_SCREENS.map((step) => (
            <option key={step} value={step}>
              {t(`settings:questions.step.${step}`)}
            </option>
          ))}
        </select>
      </label>
      <ErrorLine message={action.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={action.isBusy}>
          {t('settings:questions.saveScreen')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('settings:questions.cancel')}
        </Button>
      </div>
    </form>
  );
}

export function QuestionForm({
  screenId,
  question,
  onSave,
  onCancel,
  canStoreFiles,
  withPreview = true,
  onPreviewChange,
  withPlacements = true,
}: {
  readonly screenId: string;
  readonly question: CustomQuestion | null;
  readonly canStoreFiles: boolean;
  readonly onSave: (draft: QuestionDraft) => Promise<void>;
  readonly onCancel: () => void;
  /**
   * False on the Onboarding page (RAPP-643), the template of her
   * registration: a new question shows there only, and an existing one keeps
   * every place it already has. Settings keeps the choice.
   */
  readonly withPlacements?: boolean;
  /** False where the page draws its own phone (the screen editor, RAPP-641). */
  readonly withPreview?: boolean;
  /** Each change as her phone would show it, for that page's phone. */
  readonly onPreviewChange?: (draft: PreviewDraft) => void;
}) {
  const { t } = useTranslation('settings');
  const action = useAction();
  const isNew = question === null;
  const [type, setType] = useState<CustomQuestionType>(question?.type ?? 'short_text');
  const kept = question === null ? [] : liveOptions(question);
  const [newOptions, setNewOptions] = useState(isNew ? 2 : 0);
  const allowedPlacements = placementsAllowedFor(type);
  const formRef = useRef<HTMLFormElement>(null);
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  const optionNames = [
    ...kept.map((option) => `option-${option.id}`),
    ...Array.from({ length: newOptions }, (_, index) => `option-new-${index}`),
  ];
  const [preview, setPreview] = useState<PreviewDraft>(() => ({
    type,
    label: question?.label ?? {},
    help: question?.help ?? {},
    settings: question?.settings ?? {},
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
    const draft: QuestionDraft = {
      id: question?.id ?? null,
      screenId,
      type,
      label: textFromForm(fields, 'question-label'),
      help: (() => {
        const help = textFromForm(fields, 'question-help');
        return Object.keys(help).length === 0 ? null : help;
      })(),
      privacy: (question?.privacy ?? fields.get('question-privacy')) as QuestionPrivacy,
      placements: withPlacements
        ? QUESTION_PLACEMENTS.filter(
            (placement) => fields.get(`question-placement-${placement}`) === 'on',
          )
        : (question?.placements ?? ['wizard']),
      settings: readQuestionSettings(fields, type),
      options,
    };
    const checked = questionDraftSchema.safeParse(draft);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      const path = issue?.path[0];
      action.setError(
        path === 'placements'
          ? issue?.message === 'placements of the type'
            ? t('questions.placementNotForType')
            : t('questions.placementNeeded')
          : path === 'options'
            ? issue?.message === 'too many options'
              ? t('questions.tooManyOptions')
              : t('questions.optionsNeeded')
            : path === 'settings'
              ? t('questions.settingsInvalid')
              : t('questions.catalanNeeded'),
      );
      return;
    }
    if (await action.run(() => onSave(draft))) onCancel();
  }

  return (
    <div
      className={
        withPreview ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]' : 'grid gap-4'
      }
    >
      <form
        ref={formRef}
        className="flex flex-col gap-3 rounded-xl border bg-card p-4"
        data-testid="question-form"
        onSubmit={(event) => void submit(event)}
        onChange={refreshPreview}
        onInput={refreshPreview}
      >
        <h3 className="text-start font-semibold">
          {isNew ? t('questions.newQuestion') : t('questions.editQuestion')}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>{t('questions.type')}</span>
            <select
              name="question-type"
              value={type}
              disabled={!isNew}
              onChange={(event) => setType(event.target.value as CustomQuestionType)}
              className={inputClass}
            >
              {CUSTOM_QUESTION_TYPES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {t(`questions.types.${candidate}`)}
                </option>
              ))}
            </select>
            <TypeDescription type={type} />
            {isNew ? null : (
              <span className="text-start text-xs font-normal text-muted-foreground">
                {t('questions.typeLocked')}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>{t('questions.privacy')}</span>
            <select
              name="question-privacy"
              defaultValue={question?.privacy ?? 'personal'}
              disabled={!isNew}
              className={inputClass}
            >
              {QUESTION_PRIVACY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`questions.privacyLevels.${level}`)}
                </option>
              ))}
            </select>
            <span className="text-start text-xs font-normal text-muted-foreground">
              {isNew ? t('questions.privacyHint') : t('questions.privacyLocked')}
            </span>
          </label>
        </div>
        {isNew ? <TypeGuide /> : null}
        <fieldset className="flex flex-col gap-2 rounded-lg border p-3" hidden={!withPlacements}>
          <legend className="px-1 text-start text-sm font-medium">
            {t('questions.placements')}
          </legend>
          {QUESTION_PLACEMENTS.map((placement) => (
            <label key={placement} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`question-placement-${placement}`}
                defaultChecked={question?.placements.includes(placement) ?? placement === 'wizard'}
                disabled={!allowedPlacements.includes(placement)}
              />
              <span>{t(`questions.placement.${placement}`)}</span>
            </label>
          ))}
          {allowedPlacements.length < QUESTION_PLACEMENTS.length ? (
            <p className="text-start text-xs text-muted-foreground">
              {t('questions.placementHers')}
            </p>
          ) : null}
        </fieldset>
        <LanguageFields
          name="question-label"
          legend={t('questions.label')}
          value={question?.label}
          isCatalanRequired
        />
        <LanguageFields
          name="question-help"
          legend={t('questions.help')}
          value={question?.help}
          isCatalanRequired={false}
          isLong
        />
        <QuestionSettingsFields
          key={type}
          type={type}
          settings={question?.type === type ? question.settings : undefined}
          uploadsAvailable={canStoreFiles}
          consentTextField={
            <LanguageFields
              name="setting-consent-text"
              legend={t('questions.settings.consentText')}
              value={
                question !== null && 'text' in question.settings
                  ? (question.settings as { readonly text: BuilderText }).text
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
        <div className="flex gap-2">
          <Button type="submit" disabled={action.isBusy}>
            {t('questions.saveQuestion')}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('questions.cancel')}
          </Button>
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

function SmallButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function QuestionBuilder({
  catalog,
  builtins,
  onSaveScreen,
  onArchiveScreen,
  onReorderScreens,
  onSaveQuestion,
  onArchiveQuestion,
  onReorderQuestions,
  onSaveBuiltin,
  onSaveBuiltinRequired,
  onSaveCustomRequired,
  canStoreFiles = false,
}: QuestionBuilderProps) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as 'ca';
  const [editing, setEditing] = useState<Editing>(null);
  const action = useAction();
  const live = catalog.screens.filter((screen) => !screen.isArchived);
  // The one required list (RAPP-611), as her phone reads it.
  const required = requiredBuiltinQuestions(catalog);

  const placementsText = (question: CustomQuestion) =>
    question.placements
      .map((placement: QuestionPlacement) => t(`questions.placement.${placement}`))
      .join(' · ');

  return (
    <div className="flex flex-col gap-8" data-testid="question-builder">
      <section className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-start text-lg font-semibold">{t('questions.screensTitle')}</h3>
            <p className="text-start text-sm text-muted-foreground">
              {t('questions.screensIntro')}
            </p>
          </div>
          <Button type="button" onClick={() => setEditing({ kind: 'screen', screen: null })}>
            {t('questions.newScreen')}
          </Button>
        </header>
        <ErrorLine message={action.error} />
        {editing?.kind === 'screen' && editing.screen === null ? (
          <ScreenForm screen={null} onSave={onSaveScreen} onCancel={() => setEditing(null)} />
        ) : null}
        {live.length === 0 ? (
          <p className="text-start text-sm text-muted-foreground">{t('questions.noScreens')}</p>
        ) : null}
        {BUILTIN_SCREENS.map((step) => {
          const after = live.filter((screen) => screen.afterScreen === step);
          if (after.length === 0) return null;
          const ids = after.map((screen) => screen.id);
          return (
            <div key={step} className="flex flex-col gap-3">
              <p className="text-start text-sm font-medium text-muted-foreground">
                {t('questions.afterStepTitle', { step: t(`questions.step.${step}`) })}
              </p>
              {after.map((screen, index) => {
                const questions = screen.questions.filter((question) => !question.isArchived);
                const questionIds = questions.map((question) => question.id);
                return (
                  <article
                    key={screen.id}
                    className="flex flex-col gap-3 rounded-xl border p-4"
                    data-testid={`builder-screen-${screen.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-start font-semibold">{textIn(screen.title, language)}</h4>
                      <div className="flex flex-wrap gap-1">
                        <SmallButton
                          label={t('questions.moveUp')}
                          disabled={index === 0 || action.isBusy}
                          onClick={() => {
                            const next = [...ids];
                            next.splice(index, 1);
                            next.splice(index - 1, 0, screen.id);
                            void action.run(() => onReorderScreens(step, next));
                          }}
                        >
                          ↑
                        </SmallButton>
                        <SmallButton
                          label={t('questions.moveDown')}
                          disabled={index === after.length - 1 || action.isBusy}
                          onClick={() => {
                            const next = [...ids];
                            next.splice(index, 1);
                            next.splice(index + 1, 0, screen.id);
                            void action.run(() => onReorderScreens(step, next));
                          }}
                        >
                          ↓
                        </SmallButton>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing({ kind: 'screen', screen })}
                        >
                          {t('questions.edit')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={action.isBusy}
                          onClick={() => {
                            if (window.confirm(t('questions.archiveScreenConfirm'))) {
                              void action.run(() => onArchiveScreen(screen.id));
                            }
                          }}
                        >
                          {t('questions.archive')}
                        </Button>
                      </div>
                    </div>
                    {editing?.kind === 'screen' && editing.screen?.id === screen.id ? (
                      <ScreenForm
                        screen={screen}
                        onSave={onSaveScreen}
                        onCancel={() => setEditing(null)}
                      />
                    ) : null}
                    <ul className="flex flex-col divide-y rounded-lg border">
                      {questions.map((question, questionIndex) => (
                        <li
                          key={question.id}
                          className="flex flex-col gap-2 p-3"
                          data-testid={`builder-question-${question.id}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-col gap-0.5">
                              <p className="text-start text-sm font-medium">
                                {textIn(question.label, language)}
                              </p>
                              <p className="text-start text-xs text-muted-foreground">
                                {t(`questions.types.${question.type}`)} ·{' '}
                                {t(`questions.privacyLevels.${question.privacy}`)} ·{' '}
                                {placementsText(question)}
                              </p>
                              <RequiredSwitch
                                id={`custom-required-${question.id}`}
                                checked={isCustomQuestionRequired(question)}
                                lockReason={
                                  canRequireCustomQuestion(question)
                                    ? undefined
                                    : t('questions.requiredLock.notHers')
                                }
                                note={t('questions.requiredCustomNote')}
                                disabled={action.isBusy}
                                onChange={(next) =>
                                  void action.run(() => onSaveCustomRequired(question.id, next))
                                }
                              />
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <SmallButton
                                label={t('questions.moveUp')}
                                disabled={questionIndex === 0 || action.isBusy}
                                onClick={() => {
                                  const next = [...questionIds];
                                  next.splice(questionIndex, 1);
                                  next.splice(questionIndex - 1, 0, question.id);
                                  void action.run(() => onReorderQuestions(screen.id, next));
                                }}
                              >
                                ↑
                              </SmallButton>
                              <SmallButton
                                label={t('questions.moveDown')}
                                disabled={questionIndex === questions.length - 1 || action.isBusy}
                                onClick={() => {
                                  const next = [...questionIds];
                                  next.splice(questionIndex, 1);
                                  next.splice(questionIndex + 1, 0, question.id);
                                  void action.run(() => onReorderQuestions(screen.id, next));
                                }}
                              >
                                ↓
                              </SmallButton>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setEditing({ kind: 'question', screenId: screen.id, question })
                                }
                              >
                                {t('questions.edit')}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={action.isBusy}
                                onClick={() => {
                                  if (window.confirm(t('questions.archiveQuestionConfirm'))) {
                                    void action.run(() => onArchiveQuestion(question.id));
                                  }
                                }}
                              >
                                {t('questions.archive')}
                              </Button>
                            </div>
                          </div>
                          {editing?.kind === 'question' && editing.question?.id === question.id ? (
                            <QuestionForm
                              screenId={screen.id}
                              question={question}
                              onSave={onSaveQuestion}
                              onCancel={() => setEditing(null)}
                              canStoreFiles={canStoreFiles}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {editing?.kind === 'question' &&
                    editing.question === null &&
                    editing.screenId === screen.id ? (
                      <QuestionForm
                        screenId={screen.id}
                        question={null}
                        onSave={onSaveQuestion}
                        onCancel={() => setEditing(null)}
                        canStoreFiles={canStoreFiles}
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="self-start"
                        onClick={() =>
                          setEditing({ kind: 'question', screenId: screen.id, question: null })
                        }
                      >
                        {t('questions.addQuestion')}
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-start text-lg font-semibold">{t('questions.builtinTitle')}</h3>
          <p className="text-start text-sm text-muted-foreground">
            {t('questions.builtinListIntro')}
          </p>
        </div>
        <ul className="flex flex-col divide-y rounded-xl border">
          {builtins.map((info) => {
            const override = overrideFor(catalog, info.question);
            const reworded = override?.label == null ? null : textIn(override.label, language);
            return (
              <li
                key={info.question}
                className="flex flex-col gap-2 p-3"
                data-testid={`builder-builtin-${info.question}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-start text-sm font-medium">{reworded || info.label}</p>
                    <p className="text-start text-xs text-muted-foreground">
                      {override?.isHidden && canHideBuiltin(info.question, required)
                        ? t('questions.hidden')
                        : reworded
                          ? t('questions.reworded', { original: info.label })
                          : t('questions.asTheApp')}
                    </p>
                    <RequiredSwitch
                      id={`builtin-required-${info.question}`}
                      checked={isRequiredQuestion(info.question, required)}
                      lockReason={
                        builtinRequiredLock(info.question) === undefined
                          ? undefined
                          : t('questions.requiredLock.always')
                      }
                      note={
                        override?.isHidden && !canHideBuiltin(info.question, required)
                          ? t('questions.requiredHiddenNote')
                          : undefined
                      }
                      disabled={action.isBusy}
                      onChange={(next) =>
                        void action.run(() => onSaveBuiltinRequired(info.question, next))
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t('questions.editBuiltin', { question: info.label })}
                    onClick={() => setEditing({ kind: 'builtin', question: info.question })}
                  >
                    {t('questions.edit')}
                  </Button>
                </div>
                {editing?.kind === 'builtin' && editing.question === info.question ? (
                  <BuiltinForm
                    info={info}
                    override={override}
                    required={required}
                    onSave={onSaveBuiltin}
                    onCancel={() => setEditing(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

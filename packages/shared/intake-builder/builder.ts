/**
 * Her onboarding as staff design it (RAPP-307, RAPP-612, RAPP-649).
 *
 * The catalog holds the Ramassà screens of her onboarding, the wording of the
 * app's own questions and screens, the flow order, the required list, and the
 * profile layout: the Fitxa's fields and where each is placed (her
 * onboarding at one screen, the entity referral form, the season form). A
 * Ramassà field reaches her only through a placement, so this module reads
 * the fields as questions from the placements:
 *
 *   - a field's privacy level (Normal, Personal, Sensitive) and type are set
 *     once, on the field;
 *   - a removed option is archived, and the answers that chose it keep it;
 *   - a built-in question is reworded freely, its options relabelled or hidden,
 *     and the questions the app needs are never hidden.
 *
 * The database checks every rule; this module mirrors them so the dashboard
 * explains a locked control before anyone tries it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import { countryLabelForCanonical } from '../i18n/countries';
import { resolveLocalizedText } from '../i18n/localized-content';
import { municipalityLabelForCanonical } from '../i18n/municipalities';
import { appTermsFromCatalog, type CurrentAppTerms } from '../onboarding/app-terms';
import {
  isCustomStep,
  QUESTION_SCREENS,
  WIZARD_QUESTION_SCREENS,
  WIZARD_SCREEN_QUESTIONS,
  type IntakeQuestion,
  type WizardFlow,
  type WizardQuestionScreen,
  type WizardStepKey,
} from '../onboarding/intake';
import {
  DEFAULT_REQUIRED_QUESTIONS,
  isLockedRequiredQuestion,
  isRequiredQuestion,
  requiredQuestionsFrom,
  WIZARD_QUESTIONS,
  type RequiredQuestions,
} from '../onboarding/question-states';
import {
  isEditableWizardScreen,
  SCREEN_TEXT_FIELDS,
  screenTextFields,
  type EditableWizardScreen,
  type ScreenTextField,
} from '../onboarding/screen-texts';
import type { LanguageCode } from '../schemas/language';
import type { Database, Json } from '../types/database';
import { questionsOffTheirControl } from './app-controls';
import { systemFieldIndexFromCatalog, type SystemFieldIndex } from './field-answers';
import {
  anyLanguageTextSchema,
  builtinField,
  EMPTY_PROFILE_LAYOUT,
  fieldById,
  parseProfileLayout,
  placementsOf,
  placementsOnSurface,
  type BuilderText,
  type FieldPlacement,
  type ProfileField,
  type ProfileLayout,
  type QuestionPrivacy,
} from './profile-layout';
import {
  CUSTOM_QUESTION_TYPES,
  customAnswerSchema,
  customAnswerValueSchema,
  isOptionType,
  maxOptionsFor,
  parseQuestionSettings,
  questionSettingsSchema,
  type CustomAnswerValue,
  type CustomQuestionType,
  type FileAnswer,
  type QuestionSettings,
} from './question-types';

export { CUSTOM_QUESTION_TYPES, type CustomAnswerValue, type CustomQuestionType };

type Client = SupabaseClient<Database>;

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

export const YES_NO_MAYBE = ['yes', 'no', 'maybe'] as const;

/** The built-in wizard steps a staff screen can follow, in wizard order. */
export const BUILTIN_SCREENS = QUESTION_SCREENS;
export type BuiltinScreen = (typeof BUILTIN_SCREENS)[number];

/** Answered by picking options staff wrote: cards, checkboxes or the searchable list. */
export function isChoiceType(type: CustomQuestionType): boolean {
  return isOptionType(type);
}

export const catalanTextSchema = anyLanguageTextSchema.refine(
  (text) => (text.ca ?? '').trim().length > 0,
  { message: 'catalan required' },
);

/** Drops empty languages, so a cleared translation is not stored as "". */
export function cleanText(text: BuilderText): BuilderText {
  return Object.fromEntries(
    Object.entries(text).flatMap(([language, value]) =>
      typeof value === 'string' && value.trim().length > 0 ? [[language, value.trim()]] : [],
    ),
  ) as BuilderText;
}

export function textIn(text: BuilderText | null | undefined, language: LanguageCode): string {
  if (text == null) return '';
  return resolveLocalizedText(text, language)?.text ?? '';
}

// The catalog ---------------------------------------------------------------------------------

const screenSchema = z.object({
  id: z.uuid(),
  title: anyLanguageTextSchema,
  intro: anyLanguageTextSchema.nullable(),
  after_screen: z.enum(QUESTION_SCREENS),
  sort_order: z.number().int(),
  is_archived: z.boolean(),
});

const optionOverrideSchema = z.object({
  label: anyLanguageTextSchema.optional(),
  hidden: z.boolean().optional(),
});

const overrideSchema = z.object({
  question: z.string(),
  label: anyLanguageTextSchema.nullable(),
  help: anyLanguageTextSchema.nullable(),
  is_hidden: z.boolean(),
  // Always empty since RAPP-665: an option is named on its field.
  option_overrides: z.record(z.string(), optionOverrideSchema).optional(),
});

const presetSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  states: z.record(z.string(), z.enum(['ask', 'skip'])),
});

const builtinScreenSchema = z.object({
  screen: z.string(),
  texts: z.record(z.string(), anyLanguageTextSchema),
  is_hidden: z.boolean(),
});

export const intakeCatalogSchema = z.object({
  screens: z.array(screenSchema),
  overrides: z.array(overrideSchema),
  presets: z.array(presetSchema),
  // Staff wording of the built-in screens and the flow order (RAPP-612). An
  // older server sends neither: the app's own wording and order stay.
  builtin_screens: z.array(builtinScreenSchema).optional(),
  flow_order: z.array(z.string()).nullable().optional(),
  // The current app terms version (RAPP-613), read leniently: a version this
  // build cannot read leaves the bundled text in place.
  terms: z.unknown().optional(),
  // The built-in questions that need an answer (RAPP-611). An older server
  // sends none: the app's own list.
  required_questions: z.array(z.string()).optional(),
  // The profile layout (RAPP-649), read by `parseProfileLayout`: every Ramassà
  // field and where it is asked.
  sections: z.unknown().optional(),
  fields: z.unknown().optional(),
  placements: z.unknown().optional(),
});

export interface CustomOption {
  readonly id: string;
  readonly label: BuilderText;
  readonly isArchived: boolean;
}

/** A Ramassà field as one surface asks it (RAPP-649): worded and required as its placement says. */
export interface CustomQuestion {
  readonly id: string;
  readonly showWhen?: { readonly questionId: string; readonly optionId: string };
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly privacy: QuestionPrivacy;
  readonly isArchived: boolean;
  /** The type's settings (RAPP-610): a number's range, a date's ages, a consent's text... */
  readonly settings: QuestionSettings;
  /** Required where it is asked (RAPP-611): the placement says. Absent: optional. */
  readonly isRequired?: boolean;
  readonly options: readonly CustomOption[];
}

/** A Ramassà screen of her onboarding, as staff made it (RAPP-307). */
export interface RamassaScreen {
  readonly id: string;
  readonly title: BuilderText;
  readonly intro: BuilderText | null;
  readonly afterScreen: BuiltinScreen;
  readonly isArchived: boolean;
}

/**
 * A screen of her onboarding with the Ramassà fields it asks her: a Ramassà
 * screen, or the fields placed on an app screen (`builtinScreen` set). Those
 * show on that app screen after its own questions, and are never a step of
 * their own.
 */
export interface IntakeScreen extends RamassaScreen {
  readonly questions: readonly CustomQuestion[];
  readonly builtinScreen?: WizardQuestionScreen | null;
}

export interface BuiltinOverride {
  readonly question: IntakeQuestion;
  readonly label: BuilderText | null;
  readonly help: BuilderText | null;
  readonly isHidden: boolean;
}

/** Staff wording and the hide switch of one built-in screen (RAPP-612). */
export interface BuiltinScreenSettings {
  readonly screen: EditableWizardScreen;
  readonly texts: Readonly<Partial<Record<ScreenTextField, BuilderText>>>;
  readonly isHidden: boolean;
}

export interface IntakePreset {
  readonly id: string;
  readonly name: string;
  readonly states: Readonly<Record<string, 'ask' | 'skip'>>;
}

export interface IntakeCatalog {
  readonly screens: readonly RamassaScreen[];
  readonly overrides: readonly BuiltinOverride[];
  readonly presets: readonly IntakePreset[];
  /** Staff wording of the built-in screens (RAPP-612); empty means the app's own. */
  readonly screenSettings?: readonly BuiltinScreenSettings[];
  /** The wizard steps as staff arranged them (RAPP-612); empty means the app's own order. */
  readonly flowOrder?: readonly string[];
  /** The app terms she accepts (RAPP-613); none means the bundled text. */
  readonly terms?: CurrentAppTerms | null;
  /** The built-in questions that need an answer (RAPP-611); absent means the app's own list. */
  readonly requiredQuestions?: readonly IntakeQuestion[];
  /** Sections, fields and placements (RAPP-649); absent when the catalog could not load. */
  readonly layout?: ProfileLayout;
  /**
   * The app's fields by system key, every part of a split question included
   * (RAPP-663): the app's own screens read and write their answers by these
   * ids. Absent when the catalog could not load.
   */
  readonly systemFields?: SystemFieldIndex;
}

export const EMPTY_INTAKE_CATALOG: IntakeCatalog = {
  screens: [],
  overrides: [],
  presets: [],
  screenSettings: [],
  flowOrder: [],
  terms: null,
};

export function parseIntakeCatalog(data: unknown): IntakeCatalog {
  const raw = intakeCatalogSchema.parse(data);
  return {
    screens: raw.screens.map((screen) => ({
      id: screen.id,
      title: screen.title,
      intro: screen.intro,
      afterScreen: screen.after_screen,
      isArchived: screen.is_archived,
    })),
    overrides: raw.overrides
      .filter((override) => (WIZARD_QUESTIONS as readonly string[]).includes(override.question))
      .map((override) => ({
        question: override.question as IntakeQuestion,
        label: override.label,
        help: override.help,
        isHidden: override.is_hidden,
      })),
    presets: raw.presets,
    screenSettings: (raw.builtin_screens ?? []).flatMap((entry) =>
      isEditableWizardScreen(entry.screen)
        ? [
            {
              screen: entry.screen,
              texts: Object.fromEntries(
                Object.entries(entry.texts).filter(([field]) =>
                  (SCREEN_TEXT_FIELDS as readonly string[]).includes(field),
                ),
              ),
              isHidden: entry.is_hidden,
            },
          ]
        : [],
    ),
    flowOrder: raw.flow_order ?? [],
    terms: appTermsFromCatalog(raw.terms ?? null),
    ...(raw.required_questions === undefined
      ? {}
      : { requiredQuestions: [...requiredQuestionsFrom(raw.required_questions)] }),
    ...withLayout(parseProfileLayout(raw)),
    ...(raw.fields === undefined
      ? {}
      : { systemFields: systemFieldIndexFromCatalog({ fields: raw.fields }) }),
  };
}

/** The app's fields of a catalog by system key; none when it could not load. */
export function systemFieldsOf(catalog: IntakeCatalog): SystemFieldIndex {
  return catalog.systemFields ?? new Map();
}

function withLayout(layout: ProfileLayout | undefined): { readonly layout?: ProfileLayout } {
  return layout === undefined ? {} : { layout };
}

/**
 * The built-in questions that need an answer for this organization
 * (RAPP-611): the one list her phone, her summary and the staff preview read.
 */
export function requiredBuiltinQuestions(catalog: IntakeCatalog): RequiredQuestions {
  return catalog.requiredQuestions === undefined
    ? DEFAULT_REQUIRED_QUESTIONS
    : requiredQuestionsFrom(catalog.requiredQuestions);
}

/** Whether she must answer a staff question where she is asked it (RAPP-611). */
export function isCustomQuestionRequired(question: CustomQuestion): boolean {
  return question.isRequired === true;
}

export async function fetchIntakeCatalog(client: Client): Promise<IntakeCatalog> {
  const { data, error } = await client.rpc('intake_catalog');
  if (error) throw databaseError(error);
  return parseIntakeCatalog(data);
}

// Where fields are asked ---------------------------------------------------------------------

/** A custom field as a question, worded by its own name, required as the placement says. */
export function questionFromField(
  field: ProfileField,
  placement: FieldPlacement | undefined,
): CustomQuestion {
  return {
    id: field.id,
    type: field.type,
    ...(field.showWhen === undefined
      ? {}
      : { showWhen: { questionId: field.showWhen.fieldId, optionId: field.showWhen.optionId } }),
    label: field.label,
    help: field.help,
    privacy: field.privacy,
    isArchived: field.isArchived,
    settings: parseQuestionSettings(field.type, field.settings),
    isRequired: placement?.required ?? false,
    options: field.options,
  };
}

/**
 * A custom field as a question wherever it is asked: her page reads and
 * writes every field. Required when a placement of hers (her onboarding or
 * her season form) is, as the database says.
 */
export function questionOfField(layout: ProfileLayout, field: ProfileField): CustomQuestion {
  const forHer = placementsOf(layout, field.id).filter(
    (placement) => placement.surface !== 'entity_form',
  );
  return {
    ...questionFromField(field, forHer[0]),
    isRequired: forHer.some((placement) => placement.required),
  };
}

/**
 * The live Ramassà fields her onboarding asks on one screen (an app screen
 * key, or a Ramassà screen's id), in their order, by the field's own name:
 * what staff plan with. Her phone reads them worded for her
 * (`onboardingScreenQuestions`).
 */
export function placedQuestions(
  catalog: IntakeCatalog,
  screenKey: string,
): readonly CustomQuestion[] {
  const layout = catalog.layout;
  if (layout === undefined) return [];
  return placementsOnSurface(layout, 'onboarding', screenKey).flatMap((placement) => {
    const field = fieldById(layout, placement.fieldId);
    return field === undefined || field.kind !== 'custom'
      ? []
      : [questionFromField(field, placement)];
  });
}

/** Whether a field placed on the app screen is required: then the screen always shows. */
export function hasRequiredPlacedField(
  catalog: IntakeCatalog,
  screen: WizardQuestionScreen,
): boolean {
  return placedQuestions(catalog, screen).some(isCustomQuestionRequired);
}

/** A screen she already answered completely is not shown again (RAPP-300). */
export function isScreenAnswered(screen: IntakeScreen, answers: CustomAnswers): boolean {
  return screen.questions
    .filter((question) => isCustomQuestionVisible(question, answers))
    .every((question) => answers[question.id] !== undefined);
}

export function liveOptions(question: CustomQuestion): readonly CustomOption[] {
  return question.options.filter((option) => !option.isArchived);
}

// Answers -------------------------------------------------------------------------------------

export type CustomAnswers = Readonly<Record<string, CustomAnswerValue>>;

/** Conditions reference stable option IDs, never translated labels. */
export function isCustomQuestionVisible(question: CustomQuestion, answers: CustomAnswers): boolean {
  return (
    question.showWhen === undefined ||
    answers[question.showWhen.questionId] === question.showWhen.optionId
  );
}

/** An explicit answer also clears explanations that no longer apply. */
export function updateCustomAnswer(
  questions: readonly CustomQuestion[],
  answers: CustomAnswers,
  questionId: string,
  value: CustomAnswerValue,
): CustomAnswers {
  const next = { ...answers, [questionId]: value };
  for (const question of questions) {
    if (question.showWhen?.questionId === questionId && !isCustomQuestionVisible(question, next))
      next[question.id] = '';
  }
  return next;
}

const answerValueSchema = customAnswerValueSchema;

/**
 * Checks a value against its question with the type's one schema
 * (`customAnswerSchema`), as the database does. Null or an empty value clears
 * it, which is always allowed: every staff question is optional (RAPP-611
 * makes some required).
 */
export function customAnswerError(
  question: CustomQuestion,
  value: CustomAnswerValue | null,
): 'invalid' | null {
  if (value === null || isEmptyAnswer(value)) return null;
  return customAnswerSchema(question).safeParse(
    typeof value === 'string' && question.type !== 'phone' && question.type !== 'email'
      ? value.trim()
      : value,
  ).success
    ? null
    : 'invalid';
}

/** True when the value says nothing: empty text, nothing chosen, an unticked consent. */
export function isEmptyAnswer(value: CustomAnswerValue | null | undefined): boolean {
  if (value == null || value === false) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** The value to send: null for an empty answer, which removes it. */
export function answerPayload(answers: Readonly<Record<string, CustomAnswerValue | null>>): Json {
  return Object.fromEntries(
    Object.entries(answers).map(([id, value]) => [
      id,
      isEmptyAnswer(value)
        ? null
        : typeof value === 'string'
          ? value.trim()
          : Array.isArray(value)
            ? [...value]
            : value,
    ]),
  ) as Json;
}

/** The time a consent was given, in the organization's time zone. */
const ORGANIZATION_TIME_ZONE = 'Europe/Madrid';

function isFileAnswer(value: CustomAnswerValue): value is FileAnswer {
  return typeof value === 'object' && !Array.isArray(value) && 'key' in value;
}

/**
 * An answer in words: option labels in her language (an archived option
 * marked), a date and a number in the reader's language, a list joined, a
 * consent as yes with its time, a signature as signed, a file by its name.
 */
export function answerText(
  question: CustomQuestion,
  value: CustomAnswerValue,
  language: LanguageCode,
  words: {
    readonly yes: string;
    readonly no: string;
    readonly maybe: string;
    readonly archived: string;
    readonly signed?: string;
  },
  context: { readonly answeredAt?: string } = {},
): string {
  if (
    (question.type === 'yes_no_maybe' || question.type === 'yes_no') &&
    typeof value === 'string'
  ) {
    return value === 'yes' ? words.yes : value === 'no' ? words.no : words.maybe;
  }
  if (question.type === 'consent') {
    if (value !== true) return words.no;
    if (context.answeredAt === undefined) return words.yes;
    const at = new Intl.DateTimeFormat(language, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: ORGANIZATION_TIME_ZONE,
    }).format(new Date(context.answeredAt));
    return `${words.yes} (${at})`;
  }
  if (question.type === 'signature') return words.signed ?? words.yes;
  if (isFileAnswer(value)) return value.name;
  if (question.type === 'date' && typeof value === 'string') {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    return new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }
  if (typeof value === 'number') {
    return new Intl.NumberFormat(language, { useGrouping: false, maximumFractionDigits: 6 }).format(
      value,
    );
  }
  if (typeof value === 'boolean') return value ? words.yes : words.no;
  // A list the app ships stores the canonical name; she reads it in her language.
  if (question.type === 'country' && typeof value === 'string') {
    return countryLabelForCanonical(value, language) ?? value;
  }
  if (question.type === 'municipality' && typeof value === 'string') {
    return municipalityLabelForCanonical(value, language) ?? value;
  }
  if (!isChoiceType(question.type)) {
    return typeof value === 'string' ? value : (value as readonly unknown[]).map(String).join(', ');
  }
  const ids = typeof value === 'string' ? [value] : (value as readonly string[]);
  return ids
    .map((id) => {
      const option = question.options.find((candidate) => candidate.id === id);
      if (option === undefined) return words.archived;
      const label = textIn(option.label, language);
      return option.isArchived ? `${label} (${words.archived})` : label;
    })
    .join(', ');
}

function answersFrom(rows: readonly { question_id: string; value: unknown }[]): CustomAnswers {
  return Object.fromEntries(
    rows.flatMap((row) => {
      const parsed = answerValueSchema.safeParse(row.value);
      return parsed.success ? [[row.question_id, parsed.data]] : [];
    }),
  );
}

/** Her own answers: those of no season and those of the current season. */
export async function fetchMyCustomAnswers(client: Client): Promise<CustomAnswers> {
  const { data, error } = await client.rpc('my_custom_answers');
  if (error) throw databaseError(error);
  return answersFrom(
    z.array(z.object({ question_id: z.uuid(), value: z.unknown() })).parse(data ?? []),
  );
}

export async function saveMyCustomAnswers(
  client: Client,
  answers: Readonly<Record<string, CustomAnswerValue | null>>,
): Promise<void> {
  if (Object.keys(answers).length === 0) return;
  const { error } = await client.rpc('save_my_custom_answers', {
    p_answers: answerPayload(answers),
  });
  if (error) throw databaseError(error);
}

export interface ParticipantCustomAnswer {
  readonly questionId: string;
  readonly seasonId: string | null;
  readonly seasonName: string | null;
  readonly value: CustomAnswerValue;
  readonly source: 'player' | 'entity' | 'staff';
  readonly answeredAt: string;
  /** The team member's name, or the entity's (RAPP-653); null for hers or when unknown. */
  readonly answeredByName: string | null;
}

/** Her answers for the staff page, each season apart, by the reader's levels. */
export async function fetchParticipantCustomAnswers(
  client: Client,
  profileId: string,
): Promise<readonly ParticipantCustomAnswer[]> {
  const { data, error } = await client.rpc('participant_custom_answers', {
    p_profile_id: profileId,
  });
  if (error) throw databaseError(error);
  return z
    .array(
      z.object({
        question_id: z.uuid(),
        season_id: z.uuid().nullable(),
        season_name: z.string().nullable(),
        value: answerValueSchema,
        source: z.enum(['player', 'entity', 'staff']),
        answered_at: z.string(),
        // An older server sends none.
        answered_by_name: z.string().nullable().optional(),
      }),
    )
    .parse(data ?? [])
    .map((row) => ({
      questionId: row.question_id,
      seasonId: row.season_id,
      seasonName: row.season_name,
      value: row.value,
      source: row.source,
      answeredAt: row.answered_at,
      answeredByName: row.answered_by_name ?? null,
    }));
}

export async function setParticipantCustomAnswers(
  client: Client,
  profileId: string,
  answers: Readonly<Record<string, CustomAnswerValue | null>>,
): Promise<void> {
  const { error } = await client.rpc('set_participant_custom_answers', {
    p_profile_id: profileId,
    p_answers: answerPayload(answers),
  });
  if (error) throw databaseError(error);
}

export async function fetchReferralCustomAnswers(
  client: Client,
  referralId: string,
): Promise<CustomAnswers> {
  const { data, error } = await client.rpc('referral_custom_answers', {
    p_referral_id: referralId,
  });
  if (error) throw databaseError(error);
  return answersFrom(
    z.array(z.object({ question_id: z.uuid(), value: z.unknown() })).parse(data ?? []),
  );
}

// Building ------------------------------------------------------------------------------------

export interface ScreenDraft {
  readonly id: string | null;
  readonly title: BuilderText;
  readonly intro: BuilderText | null;
  readonly afterScreen: BuiltinScreen;
}

export async function saveIntakeScreen(client: Client, draft: ScreenDraft): Promise<string> {
  const intro = draft.intro === null ? null : cleanText(draft.intro);
  const { data, error } = await client.rpc('save_intake_screen', {
    p_id: draft.id as string,
    p_title: cleanText(draft.title) as Json,
    p_intro: (intro !== null && Object.keys(intro).length > 0 ? intro : null) as Json,
    p_after_screen: draft.afterScreen,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

export async function archiveIntakeScreen(client: Client, id: string): Promise<void> {
  const { error } = await client.rpc('archive_intake_screen', { p_id: id });
  if (error) throw databaseError(error);
}

/** What every field needs: a name, options that fit its type, settings of its type. */
const fieldShape = {
  label: catalanTextSchema,
  type: z.enum(CUSTOM_QUESTION_TYPES),
  settings: z.unknown().optional(),
  options: z.array(z.object({ id: z.string().nullable(), label: catalanTextSchema })),
};

function checkFieldShape(
  draft: {
    readonly type: CustomQuestionType;
    readonly settings?: unknown;
    readonly options: readonly unknown[];
  },
  context: z.RefinementCtx,
): void {
  const choice = isChoiceType(draft.type);
  if (choice && draft.options.length < 2) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'two options' });
  }
  if (choice && draft.options.length > maxOptionsFor(draft.type)) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'too many options' });
  }
  if (!choice && draft.options.length > 0) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'no options' });
  }
  if (!questionSettingsSchema(draft.type).safeParse(draft.settings ?? {}).success) {
    context.addIssue({ code: 'custom', path: ['settings'], message: 'settings of the type' });
  }
}

/** A field of the profile layout (RAPP-650). */
export const profileFieldDraftSchema = z.object(fieldShape).superRefine(checkFieldShape);

// Built-in questions ---------------------------------------------------------------------------

/**
 * Why a built-in control is locked, as a translation key under
 * `settings:questions.lock.*`, or undefined. Wording is never locked. A
 * required question is never hidden (RAPP-611 makes the list data).
 */
export function builtinHideLock(
  question: IntakeQuestion,
  required: RequiredQuestions = DEFAULT_REQUIRED_QUESTIONS,
): 'required' | undefined {
  return isRequiredQuestion(question, required) ? 'required' : undefined;
}

export function canHideBuiltin(
  question: IntakeQuestion,
  required: RequiredQuestions = DEFAULT_REQUIRED_QUESTIONS,
): boolean {
  return builtinHideLock(question, required) === undefined;
}

/**
 * Why the required switch of a built-in question is locked (spec guard): her
 * first name, last name and app language are always required.
 */
export function builtinRequiredLock(question: IntakeQuestion): 'always' | undefined {
  return isLockedRequiredQuestion(question) ? 'always' : undefined;
}

/** Staff make a built-in question required or optional (RAPP-611); the database audits it. */
export async function saveBuiltinQuestionRequired(
  client: Client,
  question: IntakeQuestion,
  isRequired: boolean,
): Promise<void> {
  const { error } = await client.rpc('save_builtin_question_required', {
    p_question: question,
    p_is_required: isRequired,
  });
  if (error) throw databaseError(error);
}

export async function saveBuiltinOverride(
  client: Client,
  override: BuiltinOverride,
): Promise<void> {
  const label = override.label === null ? null : cleanText(override.label);
  const help = override.help === null ? null : cleanText(override.help);
  const { error } = await client.rpc('save_builtin_question_override', {
    p_question: override.question,
    p_label: (label !== null && Object.keys(label).length > 0 ? label : null) as Json,
    p_help: (help !== null && Object.keys(help).length > 0 ? help : null) as Json,
    p_is_hidden: override.isHidden,
    // An option is named on its field (RAPP-665): nothing is kept on the question.
    p_option_overrides: {},
  });
  if (error) throw databaseError(error);
}

export function overrideFor(
  catalog: IntakeCatalog,
  question: IntakeQuestion,
): BuiltinOverride | undefined {
  return catalog.overrides.find((override) => override.question === question);
}

/**
 * Staff wording in exactly her language, or empty. A built-in question already
 * has the app's own translation in every language, so a staff label written in
 * Catalan only must not replace her Arabic one (RAPP-530).
 */
function exactText(text: BuilderText | null | undefined, language: LanguageCode): string {
  return text?.[language]?.trim() ?? '';
}

/** Staff wording for a built-in question in her language, or null for the app's own. */
export function builtinLabel(
  catalog: IntakeCatalog,
  question: IntakeQuestion,
  language: LanguageCode,
): string | null {
  return exactText(overrideFor(catalog, question)?.label, language) || null;
}

export function builtinHelp(
  catalog: IntakeCatalog,
  question: IntakeQuestion,
  language: LanguageCode,
): string | null {
  return exactText(overrideFor(catalog, question)?.help, language) || null;
}

/**
 * Hidden built-in questions: never asked, whatever their state. The questions
 * of a screen staff hid (RAPP-612) count too, so her phone, her summary and
 * the staff preview all leave them out.
 */
export function hiddenBuiltinQuestions(catalog: IntakeCatalog): ReadonlySet<IntakeQuestion> {
  const required = requiredBuiltinQuestions(catalog);
  return new Set([
    ...catalog.overrides
      .filter((override) => override.isHidden && canHideBuiltin(override.question, required))
      .map((override) => override.question),
    ...[...wizardFlow(catalog).hiddenScreens].flatMap((screen) => WIZARD_SCREEN_QUESTIONS[screen]),
    // Off their own control (RAPP-665): the generic renderer asks their fields.
    ...(catalog.layout === undefined ? [] : questionsOffTheirControl(catalog.layout)),
  ]);
}

/**
 * Whether re-registration (RAPP-306) asks a built-in season question. It
 * follows her wizard (RAPP-612): a question staff hid, or one on a screen
 * staff hid, is hidden in both, so hiding the season screen also stops
 * re-registration asking her situation. One rule, so the two never disagree.
 */
export function reregistrationAsks(catalog: IntakeCatalog): (question: IntakeQuestion) => boolean {
  const hidden = hiddenBuiltinQuestions(catalog);
  return (question) => !hidden.has(question);
}

/**
 * The options of a built-in choice question as she sees them (RAPP-665): in the
 * order of its field's options, named as the field names them in her language,
 * archived ones left out (unless it is her stored value). The options are the
 * field's, edited on Dades de les jugadores; an option the field does not have
 * keeps the app's own label.
 */
export function builtinOptions<Option extends { readonly value: string; readonly label: string }>(
  catalog: IntakeCatalog,
  question: IntakeQuestion,
  options: readonly Option[],
  language: LanguageCode,
  keep: string | null = null,
): readonly Option[] {
  const field = catalog.layout === undefined ? undefined : builtinField(catalog.layout, question);
  if (field === undefined || field.options.length === 0) return options;
  const position = (value: string) => {
    const index = field.options.findIndex((option) => option.key === value);
    return index === -1 ? field.options.length : index;
  };
  return [...options]
    .sort((a, b) => position(a.value) - position(b.value))
    .flatMap((option) => {
      const own = field.options.find((candidate) => candidate.key === option.value);
      if (own === undefined) return [option];
      if (own.isArchived && option.value !== keep) return [];
      const label = exactText(own.label, language);
      return [label === '' ? option : { ...option, label }];
    });
}

// Built-in screens (RAPP-612) ------------------------------------------------------------------

/**
 * A built-in screen can be hidden only when none of its questions is required.
 * It reads the one required list (RAPP-611), so a screen whose question
 * becomes required shows again by itself.
 */
export function canHideBuiltinScreen(
  screen: WizardQuestionScreen,
  required: RequiredQuestions = DEFAULT_REQUIRED_QUESTIONS,
): boolean {
  return WIZARD_SCREEN_QUESTIONS[screen].every((question) => canHideBuiltin(question, required));
}

function isWizardQuestionScreen(screen: string): screen is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(screen);
}

function isFlowStep(step: string): step is WizardStepKey {
  return isWizardQuestionScreen(step) || (isCustomStep(step) && step.length > 'custom:'.length);
}

/** The flow staff arranged, as the wizard planner takes it. */
export function wizardFlow(catalog: IntakeCatalog): WizardFlow {
  const required = requiredBuiltinQuestions(catalog);
  return {
    order: (catalog.flowOrder ?? []).filter(isFlowStep),
    hiddenScreens: new Set(
      (catalog.screenSettings ?? [])
        .filter((settings) => settings.isHidden)
        .map((settings) => settings.screen)
        .filter(isWizardQuestionScreen)
        .filter((screen) => canHideBuiltinScreen(screen, required))
        // A required field placed on it keeps the screen shown (RAPP-642).
        .filter((screen) => !hasRequiredPlacedField(catalog, screen)),
    ),
  };
}

export function screenSettingsFor(
  catalog: IntakeCatalog,
  screen: EditableWizardScreen,
): BuiltinScreenSettings | undefined {
  return (catalog.screenSettings ?? []).find((settings) => settings.screen === screen);
}

/**
 * Staff wording of a built-in screen in exactly her language, or null for the
 * app's own text. As for questions (RAPP-530), Catalan written by staff never
 * replaces her Arabic: the app already has every language bundled.
 */
export function builtinScreenText(
  catalog: IntakeCatalog,
  screen: EditableWizardScreen,
  field: ScreenTextField,
  language: LanguageCode,
): string | null {
  if (!screenTextFields(screen).includes(field)) return null;
  return exactText(screenSettingsFor(catalog, screen)?.texts[field], language) || null;
}

export async function saveBuiltinScreen(
  client: Client,
  settings: {
    readonly screen: EditableWizardScreen;
    readonly texts: Readonly<Partial<Record<ScreenTextField, BuilderText>>>;
    readonly isHidden: boolean;
  },
): Promise<void> {
  const texts = Object.fromEntries(
    screenTextFields(settings.screen).flatMap((field) => {
      const text = settings.texts[field];
      const cleaned = text === undefined ? {} : cleanText(text);
      return Object.keys(cleaned).length > 0 ? [[field, cleaned]] : [];
    }),
  );
  const { error } = await client.rpc('save_builtin_screen', {
    p_screen: settings.screen,
    p_texts: texts as Json,
    p_is_hidden: settings.isHidden,
  });
  if (error) throw databaseError(error);
}

/** The order of the movable steps; the summary and the terms always end it. */
export async function saveWizardFlowOrder(
  client: Client,
  order: readonly WizardStepKey[],
): Promise<void> {
  const { error } = await client.rpc('save_intake_flow_order', { p_order: [...order] });
  if (error) throw databaseError(error);
}

// Organization presets (RAPP-301) -------------------------------------------------------------

export async function saveIntakePreset(
  client: Client,
  preset: {
    readonly id: string | null;
    readonly name: string;
    readonly states: Readonly<Record<string, 'ask' | 'skip'>>;
  },
): Promise<string> {
  const { data, error } = await client.rpc('save_intake_state_preset', {
    p_id: preset.id as string,
    p_name: preset.name.trim(),
    p_states: preset.states as Json,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

export async function deleteIntakePreset(client: Client, id: string): Promise<void> {
  const { error } = await client.rpc('delete_intake_state_preset', { p_id: id });
  if (error) throw databaseError(error);
}

// Per-player choices on staff questions (RAPP-643) --------------------------------------------------

/**
 * Staff's Ask or Don't ask on the questions they wrote, for one player, by
 * question id. No entry is Auto: asked unless she already answered it.
 */
export type CustomQuestionStates = Readonly<Record<string, 'ask' | 'skip'>>;

/** How a staff question travels in the `question_states` object, beside the app's own. */
export function customStateKey(questionId: string): `custom:${string}` {
  return `custom:${questionId}`;
}

/** Don't ask is allowed on a staff question: optional, or required and answered. */
export function canSkipCustomQuestion(
  question: CustomQuestion,
  answers: CustomAnswers = {},
): boolean {
  return !isCustomQuestionRequired(question) || answers[question.id] !== undefined;
}

/**
 * The staff choices to send with the invitation, keyed `custom:<id>`: Don't
 * ask on a question it is not allowed for falls back to Auto, as the database
 * would refuse it, and a question no longer live is left out.
 */
export function allowedCustomQuestionStates(
  states: CustomQuestionStates,
  catalog: IntakeCatalog,
): Readonly<Record<string, 'ask' | 'skip'>> {
  const layout = catalog.layout ?? EMPTY_PROFILE_LAYOUT;
  return Object.fromEntries(
    Object.entries(states).flatMap(([id, state]) => {
      const field = fieldById(layout, id);
      if (field === undefined || field.kind !== 'custom' || field.isArchived) return [];
      if (state === 'skip' && !canSkipCustomQuestion(questionOfField(layout, field))) return [];
      return [[customStateKey(id), state]];
    }),
  );
}

/**
 * Her staff screens with the staff choices applied, as her phone plans
 * them: a question set to Don't ask is left out, and a screen with nothing
 * left is no screen.
 */
export function withCustomAsking(
  screens: readonly IntakeScreen[],
  asking: ReadonlyMap<string, boolean>,
): readonly IntakeScreen[] {
  return screens
    .map((screen) => ({
      ...screen,
      questions: screen.questions.filter((question) => asking.get(question.id) !== false),
    }))
    .filter((screen) => screen.questions.length > 0);
}

/**
 * Whether her wizard asks each staff question with a choice (RAPP-643): true
 * for Ask, false for Don't ask. She never reads the staff setting itself.
 */
export async function fetchMyCustomQuestionAsking(
  client: Client,
): Promise<ReadonlyMap<string, boolean>> {
  const { data, error } = await client.rpc('my_custom_question_asking');
  if (error) throw databaseError(error);
  return new Map(
    z
      .array(z.object({ question_id: z.uuid(), is_asked: z.boolean() }))
      .parse(data ?? [])
      .map((row) => [row.question_id, row.is_asked] as const),
  );
}

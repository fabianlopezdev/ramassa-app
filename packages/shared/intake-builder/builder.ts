/**
 * The staff question builder (RAPP-307).
 *
 * Staff add their own registration questions without a new app version, and
 * reword the built-in ones:
 *
 *   - a screen holds one or more custom questions and sits after one of the
 *     built-in wizard steps, because the wizard asks one topic per screen;
 *   - a question shows in any of: the player wizard, the entity referral form,
 *     each season (one answer per season), or staff only;
 *   - its privacy level (Normal, Personal, Sensitive) and its type are set once;
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
import { resolveLocalizedText } from '../i18n/localized-content';
import { appTermsFromCatalog, type CurrentAppTerms } from '../onboarding/app-terms';
import {
  customStepKey,
  isCustomStep,
  QUESTION_SCREENS,
  WIZARD_QUESTION_SCREENS,
  WIZARD_SCREEN_QUESTIONS,
  wizardFlowOrder,
  type IntakeQuestion,
  type WizardFlow,
  type WizardQuestionScreen,
  type WizardStepKey,
} from '../onboarding/intake';
import { REQUIRED_INTAKE_QUESTIONS, WIZARD_QUESTIONS } from '../onboarding/question-states';
import {
  isEditableWizardScreen,
  SCREEN_TEXT_FIELDS,
  screenTextFields,
  type EditableWizardScreen,
  type ScreenTextField,
} from '../onboarding/screen-texts';
import type { LanguageCode } from '../schemas/language';
import type { Database, Json } from '../types/database';
import {
  CUSTOM_QUESTION_TYPES,
  customAnswerSchema,
  customAnswerValueSchema,
  isOptionType,
  maxOptionsFor,
  parseQuestionSettings,
  placementsAllowedFor,
  QUESTION_PLACEMENTS,
  questionSettingsSchema,
  type CustomAnswerValue,
  type CustomQuestionType,
  type FileAnswer,
  type QuestionPlacement,
  type QuestionSettings,
} from './question-types';

export {
  CUSTOM_QUESTION_TYPES,
  QUESTION_PLACEMENTS,
  type CustomAnswerValue,
  type CustomQuestionType,
  type QuestionPlacement,
};

type Client = SupabaseClient<Database>;

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

export const QUESTION_PRIVACY_LEVELS = ['normal', 'personal', 'sensitive'] as const;
export type QuestionPrivacy = (typeof QUESTION_PRIVACY_LEVELS)[number];

export const YES_NO_MAYBE = ['yes', 'no', 'maybe'] as const;

/** The built-in wizard steps a staff screen can follow, in wizard order. */
export const BUILTIN_SCREENS = QUESTION_SCREENS;
export type BuiltinScreen = (typeof BUILTIN_SCREENS)[number];

/** Answered by picking options staff wrote: cards, checkboxes or the searchable list. */
export function isChoiceType(type: CustomQuestionType): boolean {
  return isOptionType(type);
}

// Localized text as stored: any of the five languages, Catalan required for a label.
const anyLanguageTextSchema = z.object({
  ca: z.string().optional(),
  es: z.string().optional(),
  en: z.string().optional(),
  ar: z.string().optional(),
  fa: z.string().optional(),
});
export type BuilderText = z.infer<typeof anyLanguageTextSchema>;

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

const optionSchema = z.object({
  id: z.uuid(),
  label: anyLanguageTextSchema,
  sort_order: z.number().int(),
  is_archived: z.boolean(),
});

const questionSchema = z.object({
  id: z.uuid(),
  question_type: z.enum(CUSTOM_QUESTION_TYPES),
  show_when_question_id: z.uuid().nullable().optional(),
  show_when_option_id: z.uuid().nullable().optional(),
  label: anyLanguageTextSchema,
  help: anyLanguageTextSchema.nullable(),
  privacy: z.enum(QUESTION_PRIVACY_LEVELS),
  placements: z.array(z.enum(QUESTION_PLACEMENTS)),
  sort_order: z.number().int(),
  is_archived: z.boolean(),
  // Per-type settings (RAPP-610); an older server sends none.
  settings: z.unknown().optional(),
  options: z.array(optionSchema),
});

const screenSchema = z.object({
  id: z.uuid(),
  title: anyLanguageTextSchema,
  intro: anyLanguageTextSchema.nullable(),
  after_screen: z.enum(QUESTION_SCREENS),
  sort_order: z.number().int(),
  is_archived: z.boolean(),
  questions: z.array(questionSchema),
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
  option_overrides: z.record(z.string(), optionOverrideSchema),
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
});

export interface CustomOption {
  readonly id: string;
  readonly label: BuilderText;
  readonly isArchived: boolean;
}

export interface CustomQuestion {
  readonly id: string;
  readonly screenId: string;
  readonly showWhen?: { readonly questionId: string; readonly optionId: string };
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly privacy: QuestionPrivacy;
  readonly placements: readonly QuestionPlacement[];
  readonly isArchived: boolean;
  /** The type's settings (RAPP-610): a number's range, a date's ages, a consent's text... */
  readonly settings: QuestionSettings;
  readonly options: readonly CustomOption[];
}

export interface IntakeScreen {
  readonly id: string;
  readonly title: BuilderText;
  readonly intro: BuilderText | null;
  readonly afterScreen: BuiltinScreen;
  readonly isArchived: boolean;
  readonly questions: readonly CustomQuestion[];
}

export interface BuiltinOverride {
  readonly question: IntakeQuestion;
  readonly label: BuilderText | null;
  readonly help: BuilderText | null;
  readonly isHidden: boolean;
  readonly optionOverrides: Readonly<
    Record<string, { readonly label?: BuilderText; readonly hidden?: boolean }>
  >;
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
  readonly screens: readonly IntakeScreen[];
  readonly overrides: readonly BuiltinOverride[];
  readonly presets: readonly IntakePreset[];
  /** Staff wording of the built-in screens (RAPP-612); empty means the app's own. */
  readonly screenSettings?: readonly BuiltinScreenSettings[];
  /** The wizard steps as staff arranged them (RAPP-612); empty means the app's own order. */
  readonly flowOrder?: readonly string[];
  /** The app terms she accepts (RAPP-613); none means the bundled text. */
  readonly terms?: CurrentAppTerms | null;
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
      questions: screen.questions.map((question) => ({
        id: question.id,
        screenId: screen.id,
        type: question.question_type,
        ...(question.show_when_question_id && question.show_when_option_id
          ? {
              showWhen: {
                questionId: question.show_when_question_id,
                optionId: question.show_when_option_id,
              },
            }
          : {}),
        label: question.label,
        help: question.help,
        privacy: question.privacy,
        placements: question.placements,
        isArchived: question.is_archived,
        settings: parseQuestionSettings(question.question_type, question.settings),
        options: question.options.map((option) => ({
          id: option.id,
          label: option.label,
          isArchived: option.is_archived,
        })),
      })),
    })),
    overrides: raw.overrides
      .filter((override) => (WIZARD_QUESTIONS as readonly string[]).includes(override.question))
      .map((override) => ({
        question: override.question as IntakeQuestion,
        label: override.label,
        help: override.help,
        isHidden: override.is_hidden,
        optionOverrides: override.option_overrides,
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
  };
}

export async function fetchIntakeCatalog(client: Client): Promise<IntakeCatalog> {
  const { data, error } = await client.rpc('intake_catalog');
  if (error) throw databaseError(error);
  return parseIntakeCatalog(data);
}

// Where questions show ------------------------------------------------------------------------

export function isSeasonal(question: CustomQuestion): boolean {
  return question.placements.includes('season');
}

/** Asked of the woman herself: in the wizard, or every season. */
export function isAskedOfHer(question: CustomQuestion): boolean {
  return question.placements.includes('wizard') || isSeasonal(question);
}

/**
 * The live screens that hold at least one live question for a place, each with
 * only those questions. `afterScreen` narrows them to one built-in step.
 */
export function screensFor(
  catalog: IntakeCatalog,
  shows: (question: CustomQuestion) => boolean,
  afterScreen?: BuiltinScreen,
): readonly IntakeScreen[] {
  return catalog.screens
    .filter((screen) => !screen.isArchived)
    .filter((screen) => afterScreen === undefined || screen.afterScreen === afterScreen)
    .map((screen) => ({
      ...screen,
      questions: screen.questions.filter((question) => !question.isArchived && shows(question)),
    }))
    .filter((screen) => screen.questions.length > 0);
}

export const wizardScreens = (catalog: IntakeCatalog, afterScreen?: BuiltinScreen) =>
  screensFor(catalog, isAskedOfHer, afterScreen);

/**
 * Her wizard's staff screens in the order her phone walks them (RAPP-612): the
 * flow staff arranged, so the staff preview of an invitation (RAPP-618) lists
 * them as she will see them, never in the catalog's anchor order.
 */
export function wizardScreensInFlowOrder(catalog: IntakeCatalog): readonly IntakeScreen[] {
  const screens = wizardScreens(catalog);
  const order = wizardFlowOrder(
    screens.map((screen) => ({
      id: screen.id,
      afterScreen: screen.afterScreen,
      isAnswered: false,
    })),
    wizardFlow(catalog),
  );
  const position = (screen: IntakeScreen) => order.indexOf(customStepKey(screen.id));
  return [...screens].sort((a, b) => position(a) - position(b));
}

export const seasonScreens = (catalog: IntakeCatalog) => screensFor(catalog, isSeasonal);
export const referralScreens = (catalog: IntakeCatalog) =>
  screensFor(catalog, (question) => question.placements.includes('entity_form'));

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

export async function saveReferralCustomAnswers(
  client: Client,
  referralId: string,
  answers: Readonly<Record<string, CustomAnswerValue | null>>,
): Promise<void> {
  const payload = answerPayload(answers) as Record<string, Json>;
  if (Object.values(payload).every((value) => value === null)) return;
  const { error } = await client.rpc('save_referral_custom_answers', {
    p_referral_id: referralId,
    p_answers: payload,
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

export async function reorderIntakeScreens(
  client: Client,
  afterScreen: BuiltinScreen,
  ids: readonly string[],
): Promise<void> {
  const { error } = await client.rpc('reorder_intake_screens', {
    p_after_screen: afterScreen,
    p_ids: [...ids],
  });
  if (error) throw databaseError(error);
}

export interface QuestionDraft {
  readonly id: string | null;
  readonly screenId: string;
  readonly showWhen?: { readonly questionId: string; readonly optionId: string };
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly privacy: QuestionPrivacy;
  readonly placements: readonly QuestionPlacement[];
  /** The type's settings (RAPP-610); `{}` for a type that has none. */
  readonly settings: QuestionSettings;
  /** In order; an option without an id is new, an existing one left out is archived. */
  readonly options: readonly { readonly id: string | null; readonly label: BuilderText }[];
}

export const questionDraftSchema = z
  .object({
    label: catalanTextSchema,
    placements: z.array(z.enum(QUESTION_PLACEMENTS)).min(1),
    type: z.enum(CUSTOM_QUESTION_TYPES),
    settings: z.unknown().optional(),
    options: z.array(z.object({ id: z.string().nullable(), label: catalanTextSchema })),
  })
  .superRefine((draft, context) => {
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
    const allowed = placementsAllowedFor(draft.type);
    if (draft.placements.some((placement) => !allowed.includes(placement))) {
      context.addIssue({ code: 'custom', path: ['placements'], message: 'placements of the type' });
    }
  });

export async function saveCustomQuestion(client: Client, draft: QuestionDraft): Promise<string> {
  const help = draft.help === null ? null : cleanText(draft.help);
  const { data, error } = await client.rpc('save_custom_question', {
    p_id: draft.id as string,
    p_screen_id: draft.screenId,
    p_type: draft.type,
    p_label: cleanText(draft.label) as Json,
    p_help: (help !== null && Object.keys(help).length > 0 ? help : null) as Json,
    p_privacy: draft.privacy,
    p_placements: [...draft.placements],
    p_settings: draft.settings as Json,
    p_options: draft.options.map((option) =>
      option.id === null
        ? { label: cleanText(option.label) }
        : { id: option.id, label: cleanText(option.label) },
    ) as Json,
  });
  if (error) throw databaseError(error);
  return z.uuid().parse(data);
}

export async function archiveCustomQuestion(client: Client, id: string): Promise<void> {
  const { error } = await client.rpc('archive_custom_question', { p_id: id });
  if (error) throw databaseError(error);
}

export async function reorderCustomQuestions(
  client: Client,
  screenId: string,
  ids: readonly string[],
): Promise<void> {
  const { error } = await client.rpc('reorder_custom_questions', {
    p_screen_id: screenId,
    p_ids: [...ids],
  });
  if (error) throw databaseError(error);
}

/** Moves one id up (-1) or down (+1) in a list; the ends stay put. */
export function moved(ids: readonly string[], id: string, step: -1 | 1): readonly string[] {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from === -1 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

// Built-in questions ---------------------------------------------------------------------------

/**
 * Why a built-in control is locked, as a translation key under
 * `settings:questions.lock.*`. Wording is never locked.
 */
export const BUILTIN_HIDE_LOCKS: Readonly<Partial<Record<IntakeQuestion, string>>> = {
  ...Object.fromEntries(REQUIRED_INTAKE_QUESTIONS.map((question) => [question, 'required'])),
  clothing_size: 'equipment',
  shoe_size: 'equipment',
};

export function canHideBuiltin(question: IntakeQuestion): boolean {
  return BUILTIN_HIDE_LOCKS[question] === undefined;
}

export async function saveBuiltinOverride(
  client: Client,
  override: BuiltinOverride,
): Promise<void> {
  const label = override.label === null ? null : cleanText(override.label);
  const help = override.help === null ? null : cleanText(override.help);
  const options = Object.fromEntries(
    Object.entries(override.optionOverrides).flatMap(([value, change]) => {
      const optionLabel = change.label === undefined ? undefined : cleanText(change.label);
      const hasLabel = optionLabel !== undefined && Object.keys(optionLabel).length > 0;
      if (!hasLabel && change.hidden !== true) return [];
      return [
        [
          value,
          {
            ...(hasLabel ? { label: optionLabel } : {}),
            ...(change.hidden ? { hidden: true } : {}),
          },
        ],
      ];
    }),
  );
  const { error } = await client.rpc('save_builtin_question_override', {
    p_question: override.question,
    p_label: (label !== null && Object.keys(label).length > 0 ? label : null) as Json,
    p_help: (help !== null && Object.keys(help).length > 0 ? help : null) as Json,
    p_is_hidden: override.isHidden,
    p_option_overrides: options as Json,
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
  return new Set([
    ...catalog.overrides
      .filter((override) => override.isHidden && canHideBuiltin(override.question))
      .map((override) => override.question),
    ...[...wizardFlow(catalog).hiddenScreens].flatMap((screen) => WIZARD_SCREEN_QUESTIONS[screen]),
  ]);
}

/**
 * The options of a built-in choice question as she sees them: hidden ones left
 * out (unless it is her stored value), relabelled ones in staff wording.
 */
export function builtinOptions<Option extends { readonly value: string; readonly label: string }>(
  catalog: IntakeCatalog,
  question: IntakeQuestion,
  options: readonly Option[],
  language: LanguageCode,
  keep: string | null = null,
): readonly Option[] {
  const changes = overrideFor(catalog, question)?.optionOverrides ?? {};
  return options
    .filter((option) => changes[option.value]?.hidden !== true || option.value === keep)
    .map((option) => {
      const label = exactText(changes[option.value]?.label, language);
      return label === '' ? option : { ...option, label };
    });
}

// Built-in screens (RAPP-612) ------------------------------------------------------------------

/**
 * A built-in screen can be hidden only when none of its questions is required.
 * It reads the one required list (`canHideBuiltin`), which RAPP-611 makes data,
 * so a screen whose question becomes required shows again by itself.
 */
export function canHideBuiltinScreen(screen: WizardQuestionScreen): boolean {
  return WIZARD_SCREEN_QUESTIONS[screen].every(canHideBuiltin);
}

function isWizardQuestionScreen(screen: string): screen is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(screen);
}

function isFlowStep(step: string): step is WizardStepKey {
  return isWizardQuestionScreen(step) || (isCustomStep(step) && step.length > 'custom:'.length);
}

/** The flow staff arranged, as the wizard planner takes it. */
export function wizardFlow(catalog: IntakeCatalog): WizardFlow {
  return {
    order: (catalog.flowOrder ?? []).filter(isFlowStep),
    hiddenScreens: new Set(
      (catalog.screenSettings ?? [])
        .filter((settings) => settings.isHidden)
        .map((settings) => settings.screen)
        .filter(isWizardQuestionScreen)
        .filter(canHideBuiltinScreen),
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

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
import { QUESTION_SCREENS, type IntakeQuestion } from '../onboarding/intake';
import { REQUIRED_INTAKE_QUESTIONS, WIZARD_QUESTIONS } from '../onboarding/question-states';
import type { LanguageCode } from '../schemas/language';
import type { Database, Json } from '../types/database';

type Client = SupabaseClient<Database>;

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

export const CUSTOM_QUESTION_TYPES = [
  'short_text',
  'long_text',
  'yes_no_maybe',
  'single_choice',
  'multiple_choice',
] as const;
export type CustomQuestionType = (typeof CUSTOM_QUESTION_TYPES)[number];

export const QUESTION_PRIVACY_LEVELS = ['normal', 'personal', 'sensitive'] as const;
export type QuestionPrivacy = (typeof QUESTION_PRIVACY_LEVELS)[number];

export const QUESTION_PLACEMENTS = ['wizard', 'entity_form', 'season', 'staff'] as const;
export type QuestionPlacement = (typeof QUESTION_PLACEMENTS)[number];

export const YES_NO_MAYBE = ['yes', 'no', 'maybe'] as const;

/** The built-in wizard steps a staff screen can follow, in wizard order. */
export const BUILTIN_SCREENS = QUESTION_SCREENS;
export type BuiltinScreen = (typeof BUILTIN_SCREENS)[number];

export function isChoiceType(type: CustomQuestionType): boolean {
  return type === 'single_choice' || type === 'multiple_choice';
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
  label: anyLanguageTextSchema,
  help: anyLanguageTextSchema.nullable(),
  privacy: z.enum(QUESTION_PRIVACY_LEVELS),
  placements: z.array(z.enum(QUESTION_PLACEMENTS)),
  sort_order: z.number().int(),
  is_archived: z.boolean(),
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

export const intakeCatalogSchema = z.object({
  screens: z.array(screenSchema),
  overrides: z.array(overrideSchema),
  presets: z.array(presetSchema),
});

export interface CustomOption {
  readonly id: string;
  readonly label: BuilderText;
  readonly isArchived: boolean;
}

export interface CustomQuestion {
  readonly id: string;
  readonly screenId: string;
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly privacy: QuestionPrivacy;
  readonly placements: readonly QuestionPlacement[];
  readonly isArchived: boolean;
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

export interface IntakePreset {
  readonly id: string;
  readonly name: string;
  readonly states: Readonly<Record<string, 'ask' | 'skip'>>;
}

export interface IntakeCatalog {
  readonly screens: readonly IntakeScreen[];
  readonly overrides: readonly BuiltinOverride[];
  readonly presets: readonly IntakePreset[];
}

export const EMPTY_INTAKE_CATALOG: IntakeCatalog = { screens: [], overrides: [], presets: [] };

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
        label: question.label,
        help: question.help,
        privacy: question.privacy,
        placements: question.placements,
        isArchived: question.is_archived,
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
export const seasonScreens = (catalog: IntakeCatalog) => screensFor(catalog, isSeasonal);
export const referralScreens = (catalog: IntakeCatalog) =>
  screensFor(catalog, (question) => question.placements.includes('entity_form'));

/** A screen she already answered completely is not shown again (RAPP-300). */
export function isScreenAnswered(screen: IntakeScreen, answers: CustomAnswers): boolean {
  return screen.questions.every((question) => answers[question.id] !== undefined);
}

export function liveOptions(question: CustomQuestion): readonly CustomOption[] {
  return question.options.filter((option) => !option.isArchived);
}

// Answers -------------------------------------------------------------------------------------

export type CustomAnswerValue = string | readonly string[];
export type CustomAnswers = Readonly<Record<string, CustomAnswerValue>>;

const answerValueSchema = z.union([z.string(), z.array(z.string())]);

/** Checks a value against its question, as the database does. Null clears it. */
export function customAnswerError(
  question: CustomQuestion,
  value: CustomAnswerValue | null,
): 'invalid' | null {
  if (value === null) return null;
  const live = new Set(liveOptions(question).map((option) => option.id));
  switch (question.type) {
    case 'short_text':
      return typeof value === 'string' && value.trim().length <= 500 ? null : 'invalid';
    case 'long_text':
      return typeof value === 'string' && value.trim().length <= 4000 ? null : 'invalid';
    case 'yes_no_maybe':
      return typeof value === 'string' && (YES_NO_MAYBE as readonly string[]).includes(value)
        ? null
        : 'invalid';
    case 'single_choice':
      return typeof value === 'string' && live.has(value) ? null : 'invalid';
    case 'multiple_choice':
      return Array.isArray(value) &&
        new Set(value).size === value.length &&
        value.every((id) => live.has(id))
        ? null
        : 'invalid';
  }
}

/** True when the value says nothing: empty text or no option chosen. */
export function isEmptyAnswer(value: CustomAnswerValue | null | undefined): boolean {
  if (value == null) return true;
  return typeof value === 'string' ? value.trim() === '' : value.length === 0;
}

/** The value to send: null for an empty answer, which removes it. */
export function answerPayload(answers: Readonly<Record<string, CustomAnswerValue | null>>): Json {
  return Object.fromEntries(
    Object.entries(answers).map(([id, value]) => [
      id,
      isEmptyAnswer(value) ? null : typeof value === 'string' ? value.trim() : [...(value ?? [])],
    ]),
  ) as Json;
}

/** An answer in words: option labels in her language, an archived option marked. */
export function answerText(
  question: CustomQuestion,
  value: CustomAnswerValue,
  language: LanguageCode,
  words: {
    readonly yes: string;
    readonly no: string;
    readonly maybe: string;
    readonly archived: string;
  },
): string {
  if (question.type === 'yes_no_maybe' && typeof value === 'string') {
    return value === 'yes' ? words.yes : value === 'no' ? words.no : words.maybe;
  }
  if (!isChoiceType(question.type)) return typeof value === 'string' ? value : value.join(', ');
  const ids = typeof value === 'string' ? [value] : value;
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
  readonly type: CustomQuestionType;
  readonly label: BuilderText;
  readonly help: BuilderText | null;
  readonly privacy: QuestionPrivacy;
  readonly placements: readonly QuestionPlacement[];
  /** In order; an option without an id is new, an existing one left out is archived. */
  readonly options: readonly { readonly id: string | null; readonly label: BuilderText }[];
}

export const questionDraftSchema = z
  .object({
    label: catalanTextSchema,
    placements: z.array(z.enum(QUESTION_PLACEMENTS)).min(1),
    type: z.enum(CUSTOM_QUESTION_TYPES),
    options: z.array(z.object({ id: z.string().nullable(), label: catalanTextSchema })),
  })
  .superRefine((draft, context) => {
    const choice = isChoiceType(draft.type);
    if (choice && draft.options.length < 2) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'two options' });
    }
    if (!choice && draft.options.length > 0) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'no options' });
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

/** Staff wording for a built-in question in her language, or null for the app's own. */
export function builtinLabel(
  catalog: IntakeCatalog,
  question: IntakeQuestion,
  language: LanguageCode,
): string | null {
  return textIn(overrideFor(catalog, question)?.label, language) || null;
}

export function builtinHelp(
  catalog: IntakeCatalog,
  question: IntakeQuestion,
  language: LanguageCode,
): string | null {
  return textIn(overrideFor(catalog, question)?.help, language) || null;
}

/** Hidden built-in questions: never asked, whatever their state. */
export function hiddenBuiltinQuestions(catalog: IntakeCatalog): ReadonlySet<IntakeQuestion> {
  return new Set(
    catalog.overrides
      .filter((override) => override.isHidden && canHideBuiltin(override.question))
      .map((override) => override.question),
  );
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
      const label = textIn(changes[option.value]?.label, language);
      return label === '' ? option : { ...option, label };
    });
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

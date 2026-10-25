/**
 * Every field kind the app uses, as a type of builder question (RAPP-610).
 *
 * Staff pick a type when they create a question, and it never changes once
 * she answered. Each type has:
 *
 *   - its settings (`questionSettingsSchema`): a number's range and whether it
 *     is whole, a date's age range, how many items a list takes, a consent's
 *     own text, what a file question accepts;
 *   - ONE answer schema (`customAnswerSchema`), used by her phone before she
 *     continues, by the admin before staff save, and mirrored rule for rule by
 *     the database function that saves the answer
 *     (`private.custom_answer_value_valid`, kept equal by
 *     `tests/custom-answer-parity.test.ts`);
 *   - a sample answer for the test player scenario tool (RAPP-619).
 *
 * Stored values: a number is a JSON number; a date `YYYY-MM-DD`; yes / no,
 * phone (E.164), email and a choice are strings; a list is a list of strings; a
 * consent is `true`; a signature is the strokes of the authorization pad; a
 * file is `{key, name, content_type, size}`, its key in the private folder of
 * the woman who answered; a country or a municipality is its canonical name.
 * Sensitive answers are encrypted as before.
 *
 * Docs: https://zod.dev/api (z.iso.date, refinements, discriminated settings).
 */
import { z } from 'zod';
import { signatureStrokesSchema, type SignatureStrokes } from '../equipment/handover';
import { isCanonicalCountry } from '../i18n/countries';
import { isCanonicalMunicipality } from '../i18n/municipalities';
import type { LanguageCode } from '../schemas/language';

export const CUSTOM_QUESTION_TYPES = [
  'short_text',
  'long_text',
  'yes_no_maybe',
  'single_choice',
  'multiple_choice',
  'number',
  'date',
  'yes_no',
  'phone',
  'email',
  'search_choice',
  'item_list',
  'consent',
  'file_upload',
  'signature',
  'country',
  'municipality',
] as const;
export type CustomQuestionType = (typeof CUSTOM_QUESTION_TYPES)[number];

/**
 * The two lists the app ships (D6, RAPP-660): every country and every
 * municipality of Catalonia. The answer is the canonical name the pickers
 * already store (`Síria`, `Vic`), whatever language she reads.
 */
export const LIST_TYPES = ['country', 'municipality'] as const;

/**
 * The types the field form offers: every type, the two lists included, since
 * her phone and the team's pages render them all (RAPP-663, RAPP-664).
 */
export const BUILDER_QUESTION_TYPES: readonly CustomQuestionType[] = CUSTOM_QUESTION_TYPES;

/** Types answered by picking options staff wrote. */
export const OPTION_TYPES = ['single_choice', 'multiple_choice', 'search_choice'] as const;

export function isOptionType(type: CustomQuestionType): boolean {
  return (OPTION_TYPES as readonly string[]).includes(type);
}

/** A searchable list may be long; cards stay short enough to tap through. */
export function maxOptionsFor(type: CustomQuestionType): number {
  return type === 'search_choice' ? 500 : 60;
}

/** Staff may complete or correct every answer but a file or a signature, which are hers to give. */
export function isStaffWritable(type: CustomQuestionType): boolean {
  return type !== 'file_upload' && type !== 'signature';
}

export const YES_NO = ['yes', 'no'] as const;

export const SHORT_TEXT_MAX_LENGTH = 500;
export const LONG_TEXT_MAX_LENGTH = 4000;
export const LIST_ITEM_MAX_LENGTH = 120;
export const LIST_MAX_ITEMS = 50;
export const LIST_DEFAULT_MAX_ITEMS = 20;
export const EMAIL_MAX_LENGTH = 254;
export const FILE_NAME_MAX_LENGTH = 120;
/** The document ceiling of the media pipeline (tokens.upload.maxDocumentBytes). */
export const FILE_MAX_BYTES = 10_485_760;
/** A number staff ask for stays within what a person types. */
export const NUMBER_LIMIT = 1_000_000_000;

/** The private folder of her answer files, under her own prefix (RAPP-610). */
export const CUSTOM_ANSWER_FILE_FOLDER = 'intake-answers';

/** E.164, as the logistics phone (`schemas/onboarding.ts`). */
export const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
/** One @, a dot in the domain, no spaces. The database uses the same pattern. */
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const FILE_KEY_PATTERN = new RegExp(
  `^${UUID}/${CUSTOM_ANSWER_FILE_FOLDER}/${UUID}/\\d{4}/(0[1-9]|1[0-2])/[0-9a-f]{32}\\.(jpg|png|webp|pdf)$`,
);

export const FILE_ACCEPTS = ['photo', 'document'] as const;
export type FileAccept = (typeof FILE_ACCEPTS)[number];

const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const FILE_CONTENT_TYPES: Readonly<Record<FileAccept, readonly string[]>> = {
  photo: PHOTO_CONTENT_TYPES,
  document: [...PHOTO_CONTENT_TYPES, 'application/pdf'],
};

// Settings ------------------------------------------------------------------------------------

const localizedTextSchema = z.object({
  ca: z.string().optional(),
  es: z.string().optional(),
  en: z.string().optional(),
  ar: z.string().optional(),
  fa: z.string().optional(),
});
const catalanText = localizedTextSchema.refine((text) => (text.ca ?? '').trim().length > 0);

const boundedNumber = z.number().min(-NUMBER_LIMIT).max(NUMBER_LIMIT);
const age = z.int().min(0).max(120);

const numberSettingsSchema = z
  .strictObject({
    integer: z.boolean(),
    min: boundedNumber.optional(),
    max: boundedNumber.optional(),
  })
  .refine(
    (settings) =>
      settings.min === undefined || settings.max === undefined || settings.min <= settings.max,
  );
const dateSettingsSchema = z
  .strictObject({ min_age: age.optional(), max_age: age.optional() })
  .refine(
    (settings) =>
      settings.min_age === undefined ||
      settings.max_age === undefined ||
      settings.min_age <= settings.max_age,
  );
const itemListSettingsSchema = z.strictObject({ max_items: z.int().min(1).max(LIST_MAX_ITEMS) });
const consentSettingsSchema = z.strictObject({ text: catalanText });
const fileSettingsSchema = z.strictObject({ accept: z.enum(FILE_ACCEPTS) });
const noSettingsSchema = z.strictObject({});

export type NumberSettings = z.infer<typeof numberSettingsSchema>;
export type DateSettings = z.infer<typeof dateSettingsSchema>;
export type ItemListSettings = z.infer<typeof itemListSettingsSchema>;
export type ConsentSettings = z.infer<typeof consentSettingsSchema>;
export type FileSettings = z.infer<typeof fileSettingsSchema>;
export type QuestionSettings =
  | NumberSettings
  | DateSettings
  | ItemListSettings
  | ConsentSettings
  | FileSettings
  | Readonly<Record<string, never>>;

/** The settings a type takes; every other type takes none. */
export function questionSettingsSchema(type: CustomQuestionType): z.ZodType<QuestionSettings> {
  switch (type) {
    case 'number':
      return numberSettingsSchema;
    case 'date':
      return dateSettingsSchema;
    case 'item_list':
      return itemListSettingsSchema;
    case 'consent':
      return consentSettingsSchema;
    case 'file_upload':
      return fileSettingsSchema;
    default:
      return noSettingsSchema;
  }
}

const DEFAULT_SETTINGS: Readonly<Partial<Record<CustomQuestionType, QuestionSettings>>> = {
  number: { integer: false },
  item_list: { max_items: LIST_DEFAULT_MAX_ITEMS },
  consent: { text: { ca: '' } },
  file_upload: { accept: 'document' },
};

/** The settings as stored, or the type's safe default when this build cannot read them. */
export function parseQuestionSettings(type: CustomQuestionType, raw: unknown): QuestionSettings {
  const parsed = questionSettingsSchema(type).safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return DEFAULT_SETTINGS[type] ?? {};
}

export function numberSettings(settings: QuestionSettings): NumberSettings {
  return 'integer' in settings ? (settings as NumberSettings) : { integer: false };
}
export function dateSettings(settings: QuestionSettings): DateSettings {
  return 'min_age' in settings || 'max_age' in settings ? (settings as DateSettings) : {};
}
export function itemListSettings(settings: QuestionSettings): ItemListSettings {
  return 'max_items' in settings
    ? (settings as ItemListSettings)
    : { max_items: LIST_DEFAULT_MAX_ITEMS };
}
export function consentSettings(settings: QuestionSettings): ConsentSettings {
  return 'text' in settings ? (settings as ConsentSettings) : { text: { ca: '' } };
}
export function fileSettings(settings: QuestionSettings): FileSettings {
  return 'accept' in settings ? (settings as FileSettings) : { accept: 'document' };
}

/**
 * Whether this app can store files: the media service address it was built
 * with. Hosted staging has none yet, so the builder warns staff and her phone
 * says the upload is not available instead of failing.
 */
export function uploadsAvailable(mediaWorkerUrl: string | undefined): boolean {
  return mediaWorkerUrl !== undefined && mediaWorkerUrl.trim() !== '';
}

// Answers -------------------------------------------------------------------------------------

export interface FileAnswer {
  readonly key: string;
  readonly name: string;
  readonly content_type: string;
  readonly size: number;
}

export type CustomAnswerValue =
  string | number | boolean | readonly string[] | SignatureStrokes | FileAnswer;

/** What every answer of every type can be, for reading stored rows. */
export const customAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  signatureStrokesSchema,
  z.object({
    key: z.string(),
    name: z.string(),
    content_type: z.string(),
    size: z.number(),
  }),
]);

/** The minimum of a question the answer schema reads. */
export interface AnswerQuestionShape {
  readonly type: CustomQuestionType;
  readonly settings: QuestionSettings;
  readonly options: readonly { readonly id: string; readonly isArchived: boolean }[];
}

/** Whole years between a birth date and today (UTC), as the database counts them. */
export function ageOn(isoDate: string, today: Date = new Date()): number {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  let years = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() + 1 < month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  if (beforeBirthday) years -= 1;
  return years;
}

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1900 &&
    year <= 2100 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Characters as she sees them (code points), the way Postgres `length` counts. */
function characterCount(text: string): number {
  return [...text].length;
}

/**
 * The one check of an answer. `private.custom_answer_value_valid` in the
 * database states the same rules; change both together.
 */
export function customAnswerSchema(question: AnswerQuestionShape): z.ZodType<CustomAnswerValue> {
  const live = new Set(question.options.filter((option) => !option.isArchived).map((o) => o.id));
  // Lengths count characters as she sees them (code points), as Postgres
  // `length` does: an emoji is one, never two UTF-16 units.
  const trimmedText = (max: number) =>
    z.string().refine((value) => {
      const length = characterCount(value.trim());
      return length >= 1 && length <= max;
    });
  switch (question.type) {
    case 'short_text':
      return trimmedText(SHORT_TEXT_MAX_LENGTH);
    case 'long_text':
      return trimmedText(LONG_TEXT_MAX_LENGTH);
    case 'yes_no_maybe':
      return z.enum(['yes', 'no', 'maybe']);
    case 'yes_no':
      return z.enum(YES_NO);
    case 'single_choice':
    case 'search_choice':
      return z.string().refine((value) => live.has(value));
    case 'multiple_choice':
      return z
        .array(z.string())
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length && ids.every((id) => live.has(id)));
    case 'number': {
      const settings = numberSettings(question.settings);
      return z
        .number()
        .min(-NUMBER_LIMIT)
        .max(NUMBER_LIMIT)
        .refine((value) => !settings.integer || Number.isInteger(value))
        .refine((value) => settings.min === undefined || value >= settings.min)
        .refine((value) => settings.max === undefined || value <= settings.max);
    }
    case 'date': {
      const settings = dateSettings(question.settings);
      return z
        .string()
        .refine(isCalendarDate)
        .refine((value) => settings.min_age === undefined || ageOn(value) >= settings.min_age)
        .refine((value) => settings.max_age === undefined || ageOn(value) <= settings.max_age);
    }
    case 'phone':
      return z.string().regex(PHONE_PATTERN);
    case 'email':
      return z
        .string()
        .refine((value) => characterCount(value) <= EMAIL_MAX_LENGTH)
        .regex(EMAIL_PATTERN);
    case 'item_list': {
      const settings = itemListSettings(question.settings);
      return z
        .array(z.string())
        .min(1)
        .max(settings.max_items)
        .refine((items) =>
          items.every(
            (item) =>
              item === item.trim() &&
              characterCount(item) >= 1 &&
              characterCount(item) <= LIST_ITEM_MAX_LENGTH,
          ),
        )
        .refine((items) => new Set(items).size === items.length);
    }
    case 'consent':
      return z.literal(true);
    case 'file_upload': {
      const accepted = FILE_CONTENT_TYPES[fileSettings(question.settings).accept];
      return z.strictObject({
        key: z.string().regex(FILE_KEY_PATTERN),
        name: z
          .string()
          .refine(
            (name) => characterCount(name) >= 1 && characterCount(name) <= FILE_NAME_MAX_LENGTH,
          ),
        content_type: z.string().refine((type) => accepted.includes(type)),
        size: z.int().min(1).max(FILE_MAX_BYTES),
      });
    }
    case 'signature':
      return signatureStrokesSchema;
    case 'country':
      return z.string().refine(isCanonicalCountry);
    case 'municipality':
      return z.string().refine(isCanonicalMunicipality);
  }
}

/**
 * A phone as the field stores it (E.164, RAPP-663): separators out, a leading
 * 00 as +, and a Spanish number typed without its country code (nine digits,
 * 6 to 9 first) with +34 in front. Anything else stays as typed, so the check
 * refuses it.
 */
export function internationalPhone(value: string): string {
  const tidy = value.replace(/[\s\-.()]/g, '');
  if (tidy.startsWith('00')) return `+${tidy.slice(2)}`;
  if (/^[6-9]\d{8}$/.test(tidy)) return `+34${tidy}`;
  return tidy;
}

/**
 * What she typed, tidied the way the field shows it: a phone in its
 * international form (a Spanish number typed without +34 gets it), an email
 * lowercased, list items trimmed.
 */
export function normalizeCustomAnswerInput(
  question: Pick<AnswerQuestionShape, 'type'>,
  value: CustomAnswerValue,
): CustomAnswerValue {
  if (question.type === 'phone' && typeof value === 'string') return internationalPhone(value);
  if (question.type === 'email' && typeof value === 'string') return value.trim().toLowerCase();
  if (question.type === 'item_list' && Array.isArray(value))
    return (value as unknown as readonly string[])
      .map((item) => item.trim())
      .filter((item) => item !== '');
  return value;
}

// Samples for the scenario tool (RAPP-619) ---------------------------------------------------------

const SAMPLE_TEXT: Readonly<
  Record<LanguageCode, { readonly short: string; readonly item: string }>
> = {
  ca: { short: 'Resposta de prova', item: 'Element de prova' },
  es: { short: 'Respuesta de prueba', item: 'Elemento de prueba' },
  en: { short: 'Test answer', item: 'Test item' },
  ar: { short: 'إجابة اختبار', item: 'عنصر اختبار' },
  fa: { short: 'پاسخ آزمایشی', item: 'مورد آزمایشی' },
};

/** A birth date that is `years` old today, plus half a year so either rounding fits. */
function dateAged(years: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCMonth(date.getUTCMonth() - 6);
  return date.toISOString().slice(0, 10);
}

/**
 * A valid answer of any type, in her language, for a test player. A file is a
 * made-up key in her own folder: there is no object behind it, so opening it
 * says the file is missing.
 */
export function sampleCustomAnswer(
  question: AnswerQuestionShape,
  language: LanguageCode,
  owner: { readonly orgId: string; readonly profileId: string },
): CustomAnswerValue {
  const live = question.options.filter((option) => !option.isArchived);
  const text = SAMPLE_TEXT[language];
  switch (question.type) {
    case 'short_text':
    case 'long_text':
      return text.short;
    case 'yes_no_maybe':
    case 'yes_no':
      return 'yes';
    case 'single_choice':
    case 'search_choice':
      return live[0]?.id ?? '';
    case 'multiple_choice':
      return live.slice(0, 1).map((option) => option.id);
    case 'number': {
      const settings = numberSettings(question.settings);
      return settings.min ?? (settings.max !== undefined && settings.max < 1 ? settings.max : 1);
    }
    case 'date': {
      const settings = dateSettings(question.settings);
      const low = settings.min_age ?? 18;
      const high = settings.max_age ?? Math.max(low, 30);
      return dateAged(Math.min(Math.max(low, 30), high));
    }
    case 'phone':
      return '+34600111222';
    case 'email':
      return 'prova@example.test';
    case 'item_list':
      return [text.item];
    case 'consent':
      return true;
    case 'country':
      return 'Espanya';
    case 'municipality':
      return 'Vic';
    case 'file_upload': {
      const isPhoto = fileSettings(question.settings).accept === 'photo';
      return {
        key: `${owner.orgId}/${CUSTOM_ANSWER_FILE_FOLDER}/${owner.profileId}/2026/01/${'0'.repeat(32)}.${isPhoto ? 'jpg' : 'pdf'}`,
        name: isPhoto ? 'prova.jpg' : 'prova.pdf',
        content_type: isPhoto ? 'image/jpeg' : 'application/pdf',
        size: 1024,
      };
    }
    case 'signature':
      return [
        [
          [100, 500],
          [300, 400],
          [500, 600],
          [700, 450],
        ],
      ];
  }
}

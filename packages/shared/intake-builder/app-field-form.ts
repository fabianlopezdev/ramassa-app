/**
 * The app's own screens edit their fields through a form (RAPP-663).
 *
 * Her phone asks the app's fields on the app's own screens (her onboarding,
 * her profile, her season form, the staff phone's edit sheet), each with the
 * control it always had: the day, month and year boxes, the country picker,
 * the document cards, the size chips. Those screens keep one form per screen,
 * with names like `dateOfBirth`, and their rules in `schemas/onboarding.ts`.
 *
 * Everything else is by field. Her answers arrive by field id, are kept in her
 * draft by field id and travel by field id. This module is the one place a
 * form name meets a field: it finds the field by its system key in her
 * organization's layout, reads its answer in the shape the control takes (a
 * choice as its option's key, `nie` or `M`), and turns what the control gives
 * back into the field's answer (the option's id).
 *
 * A field whose type the control cannot read, or with an option the control
 * does not know (staff changed it on Dades de les jugadores), reads as no
 * answer here, as the features do (D7). Nothing fails: the screen asks that
 * field with the generic renderer instead (RAPP-665, `app-controls.ts`).
 */
import type { IntakeQuestion } from '../onboarding/intake';
import { SYSTEM_FIELD_QUESTIONS, type SystemFieldKey } from '../onboarding/system-fields';
import {
  CLOTHING_SIZES,
  DOCUMENT_TYPES,
  documentNameToSend,
  documentNumberToSend,
  SHOE_SIZES,
  type DocumentType,
} from '../schemas/onboarding';
import { APPLICANT_STATUSES, CHILDCARE_NEEDS } from '../schemas/season';
import {
  decodeSupportNeeds,
  encodeSupportNeeds,
  SUPPORT_NEED_CATEGORIES,
  type SupportNeedChoice,
} from '../schemas/support-needs';
import type { SystemField, SystemFieldIndex } from './field-answers';
import type { CustomAnswerValue, CustomQuestionType } from './question-types';

/** Each form name of the app's screens and the field it edits. */
export const APP_FORM_FIELDS = {
  dateOfBirth: 'date_of_birth',
  placeOfBirth: 'place_of_birth',
  nationality: 'nationality',
  documentType: 'document_type',
  documentNumber: 'document_number',
  documentName: 'document_name',
  phone: 'phone',
  address: 'address',
  city: 'city',
  postalCode: 'postal_code',
  referenceEntity: 'reference_entity',
  referenceContactName: 'reference_contact_name',
  hasDependents: 'has_dependents',
  numDependents: 'num_dependents',
  clothingSize: 'clothing_size',
  shoeSize: 'shoe_size',
  applicantStatus: 'applicant_status',
  applicantStatusDetails: 'applicant_status_details',
  supportingEntities: 'supporting_entities',
  childcareNeed: 'childcare_need',
  // The needs and their details text are two fields; the screens keep them in
  // one value (`schemas/support-needs.ts`).
  specificNeeds: 'specific_needs',
} as const satisfies Readonly<Record<string, SystemFieldKey>>;

export type AppFormKey = keyof typeof APP_FORM_FIELDS;

/** The form value of each app field, as the screens' controls hold it. */
export interface AppFormValues {
  dateOfBirth?: string;
  placeOfBirth?: string;
  nationality?: string;
  documentType?: string;
  documentNumber?: string;
  documentName?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  referenceEntity?: string;
  referenceContactName?: string;
  hasDependents?: boolean;
  numDependents?: number;
  clothingSize?: string;
  shoeSize?: string;
  applicantStatus?: string;
  applicantStatusDetails?: string;
  supportingEntities?: string[];
  childcareNeed?: string;
  specificNeeds?: string;
}

export function isAppFormKey(key: string): key is AppFormKey {
  return Object.prototype.hasOwnProperty.call(APP_FORM_FIELDS, key);
}

const TEXT_TYPES: readonly CustomQuestionType[] = ['short_text', 'long_text'];

/** The types each control reads. */
const READS: Readonly<Record<AppFormKey, readonly CustomQuestionType[]>> = {
  dateOfBirth: ['date'],
  placeOfBirth: TEXT_TYPES,
  nationality: ['country', ...TEXT_TYPES],
  documentType: ['single_choice', 'search_choice'],
  documentNumber: TEXT_TYPES,
  documentName: TEXT_TYPES,
  phone: ['phone', ...TEXT_TYPES],
  address: TEXT_TYPES,
  city: ['municipality', ...TEXT_TYPES],
  postalCode: TEXT_TYPES,
  referenceEntity: TEXT_TYPES,
  referenceContactName: TEXT_TYPES,
  hasDependents: ['single_choice', 'yes_no'],
  numDependents: ['number'],
  clothingSize: ['single_choice', 'search_choice'],
  shoeSize: ['single_choice', 'search_choice'],
  applicantStatus: ['single_choice', 'search_choice'],
  applicantStatusDetails: TEXT_TYPES,
  supportingEntities: ['item_list'],
  childcareNeed: ['yes_no_maybe', 'single_choice'],
  specificNeeds: ['multiple_choice'],
};

/** The option keys each choice control knows: an option without one it cannot draw. */
const KNOWS: Partial<Readonly<Record<AppFormKey, readonly string[]>>> = {
  documentType: DOCUMENT_TYPES,
  clothingSize: CLOTHING_SIZES,
  shoeSize: SHOE_SIZES,
  applicantStatus: APPLICANT_STATUSES,
  hasDependents: ['yes', 'no'],
  childcareNeed: CHILDCARE_NEEDS,
  specificNeeds: [...SUPPORT_NEED_CATEGORIES, 'none'],
};

/** Whether a form name's control can still ask its field: its type, and every live option's key. */
function controlReads(key: AppFormKey, field: SystemField): boolean {
  if (!READS[key].includes(field.type)) return false;
  const known = KNOWS[key];
  return (
    known === undefined ||
    field.options.every(
      (option) => option.isArchived || (option.key != null && known.includes(option.key)),
    )
  );
}

/** The app field a form name edits, when its control can still ask it. */
export function appFormField(index: SystemFieldIndex, key: AppFormKey): SystemField | undefined {
  const field = index.get(APP_FORM_FIELDS[key]);
  return field !== undefined && controlReads(key, field) ? field : undefined;
}

const FORM_KEYS = Object.keys(APP_FORM_FIELDS) as AppFormKey[];

/**
 * Whether the app's own control can still ask one of its questions (RAPP-665):
 * every field of the question the organization has is one the control reads.
 * When staff give a field a type or an option the control cannot draw, the
 * screen asks the question's fields with the generic renderer.
 */
export function appControlFits(index: SystemFieldIndex, question: IntakeQuestion): boolean {
  return FORM_KEYS.filter((key) => SYSTEM_FIELD_QUESTIONS[APP_FORM_FIELDS[key]] === question).every(
    (key) => {
      const field = index.get(APP_FORM_FIELDS[key]);
      return field === undefined || controlReads(key, field);
    },
  );
}

/** The ids of the app's fields: every answer that is not a team field's. */
export function appFieldIds(index: SystemFieldIndex): ReadonlySet<string> {
  return new Set([...index.values()].map((field) => field.id));
}

/** The key of a chosen option (`nie`, `M`), or undefined when it has none. */
export function optionKeyOf(field: SystemField, optionId: unknown): string | undefined {
  if (typeof optionId !== 'string') return undefined;
  return field.options.find((option) => option.id === optionId)?.key ?? undefined;
}

/** The option with a key, a live one first. */
export function optionIdOf(field: SystemField, key: string): string | undefined {
  return (
    field.options.find((option) => option.key === key && !option.isArchived) ??
    field.options.find((option) => option.key === key)
  )?.id;
}

// Reading ---------------------------------------------------------------------------------------

/**
 * Her answers as the app screens' forms read them. A form name with no
 * answer, or whose field's type the control cannot read, is left out.
 */
export function appFormValues(
  index: SystemFieldIndex,
  answers: Readonly<Record<string, unknown>>,
): AppFormValues {
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(APP_FORM_FIELDS) as AppFormKey[]) {
    const field = appFormField(index, key);
    if (field === undefined) continue;
    const value = formValueOf(key, field, answers[field.id], index, answers);
    if (value !== undefined) values[key] = value;
  }
  return values as AppFormValues;
}

function formValueOf(
  key: AppFormKey,
  field: SystemField,
  answer: unknown,
  index: SystemFieldIndex,
  answers: Readonly<Record<string, unknown>>,
): unknown {
  if (answer === undefined || answer === null) return undefined;
  switch (key) {
    case 'hasDependents': {
      const choice = field.type === 'yes_no' ? answer : optionKeyOf(field, answer);
      return choice === 'yes' ? true : choice === 'no' ? false : undefined;
    }
    case 'numDependents':
      return typeof answer === 'number' ? answer : undefined;
    case 'supportingEntities':
      return Array.isArray(answer)
        ? answer.filter((item): item is string => typeof item === 'string')
        : undefined;
    case 'specificNeeds':
      return supportNeedsValue(
        field,
        answer,
        answers[index.get('specific_needs_details')?.id ?? ''],
      );
    case 'documentType':
    case 'clothingSize':
    case 'shoeSize':
    case 'applicantStatus':
      return optionKeyOf(field, answer);
    case 'childcareNeed':
      return field.type === 'yes_no_maybe'
        ? typeof answer === 'string'
          ? answer
          : undefined
        : optionKeyOf(field, answer);
    default:
      return typeof answer === 'string' ? answer : undefined;
  }
}

/** The needs she chose and the details text, as the one value the screens keep. */
function supportNeedsValue(
  field: SystemField,
  needs: unknown,
  details: unknown,
): string | undefined {
  if (!Array.isArray(needs)) return undefined;
  const chosen = needs.flatMap((id) => {
    const key = optionKeyOf(field, id);
    return key === 'none' || (SUPPORT_NEED_CATEGORIES as readonly string[]).includes(key ?? '')
      ? [key as SupportNeedChoice]
      : [];
  });
  const choices = [...new Set(chosen)];
  if (choices.length === 0) return undefined;
  if (choices.includes('none')) return encodeSupportNeeds({ categories: ['none'], details: {} });
  const explanation = typeof details === 'string' && details.trim() !== '' ? details : undefined;
  return encodeSupportNeeds({
    categories: SUPPORT_NEED_CATEGORIES.filter((category) => choices.includes(category)),
    details: {},
    ...(explanation === undefined ? {} : { explanation }),
  });
}

// Sending ---------------------------------------------------------------------------------------

/** The season form's names: her re-registration asks them again. */
export const SEASON_FORM_KEYS = [
  'applicantStatus',
  'applicantStatusDetails',
  'supportingEntities',
  'childcareNeed',
  'specificNeeds',
] as const satisfies readonly AppFormKey[];

const ALL_FORM_KEYS = Object.keys(APP_FORM_FIELDS) as AppFormKey[];

/**
 * A checked form as what to send, for the form names a screen asks (every
 * one by default). The rules every screen shares: a document number only with
 * a document, its name only for another document, no count without
 * dependants, details of her status only when it is another one. A value she
 * did not give is null, which removes the answer; her entity left out stays
 * out, and her "None" to it is null.
 */
export function appFormToSend(
  form: Readonly<Record<string, unknown>>,
  keys: readonly AppFormKey[] = ALL_FORM_KEYS,
): Partial<Record<AppFormKey, unknown>> {
  const document = {
    documentType: form.documentType as DocumentType | undefined,
    documentNumber: form.documentNumber as string | undefined,
    documentName: form.documentName as string | undefined,
  };
  const sent: Partial<Record<AppFormKey, unknown>> = {};
  for (const key of keys) {
    switch (key) {
      case 'documentNumber':
        sent[key] = documentNumberToSend(document);
        break;
      case 'documentName':
        sent[key] = documentNameToSend(document);
        break;
      case 'numDependents':
        sent[key] = form.hasDependents === true ? (form.numDependents ?? null) : null;
        break;
      case 'applicantStatusDetails':
        sent[key] = form.applicantStatus === 'other' ? (form.applicantStatusDetails ?? null) : null;
        break;
      case 'referenceEntity':
        if (form.referenceEntity !== undefined) sent[key] = form.referenceEntity;
        break;
      default:
        sent[key] = form[key] ?? null;
    }
  }
  return sent;
}

// Writing ---------------------------------------------------------------------------------------

export interface AppAnswersOptions {
  /**
   * Keep what she has not finished: an emptied field stays an empty answer
   * (her draft must remember she emptied it). Without it, an empty answer is
   * null, which removes the answer.
   */
  readonly asTyped?: boolean;
}

/**
 * Form values as answers by field id. Only the form names present are
 * written; a form name whose field is missing, or whose type the control
 * cannot write, is left out.
 */
export function appAnswersFromForm(
  index: SystemFieldIndex,
  form: Readonly<Record<string, unknown>>,
  options: AppAnswersOptions = {},
): Record<string, CustomAnswerValue | null> {
  const answers: Record<string, CustomAnswerValue | null> = {};
  for (const [key, value] of Object.entries(form)) {
    if (value === undefined || !isAppFormKey(key)) continue;
    const field = appFormField(index, key);
    if (field === undefined) continue;
    if (key === 'specificNeeds') {
      const parts = supportNeedsAnswerParts(index, value);
      answers[field.id] = parts.needs ?? emptyAnswer(options);
      const details = index.get('specific_needs_details');
      if (details !== undefined) answers[details.id] = parts.details ?? emptyAnswer(options);
      continue;
    }
    answers[field.id] = answerOf(key, field, value, options);
  }
  return answers;
}

function emptyAnswer(options: AppAnswersOptions): CustomAnswerValue | null {
  return options.asTyped === true ? '' : null;
}

function answerOf(
  key: AppFormKey,
  field: SystemField,
  value: unknown,
  options: AppAnswersOptions,
): CustomAnswerValue | null {
  const empty = emptyAnswer(options);
  if (value === null) return empty;
  switch (key) {
    case 'hasDependents': {
      if (typeof value !== 'boolean') return empty;
      const choice = value ? 'yes' : 'no';
      return field.type === 'yes_no' ? choice : (optionIdOf(field, choice) ?? choice);
    }
    case 'numDependents': {
      // Without dependants the count is 0, which is no answer; her draft keeps it as she typed.
      const count =
        typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
      if (typeof count === 'number') return count > 0 || options.asTyped === true ? count : null;
      return typeof count === 'string' && count.trim() !== '' ? count : empty;
    }
    case 'supportingEntities': {
      if (!Array.isArray(value)) return empty;
      const items = value.filter((item): item is string => typeof item === 'string');
      if (options.asTyped === true) return items;
      const kept = [...new Set(items.map((item) => item.trim()))].filter((item) => item !== '');
      return kept.length === 0 ? null : kept;
    }
    case 'documentType':
    case 'clothingSize':
    case 'shoeSize':
    case 'applicantStatus':
      return chosenOption(field, value, empty);
    case 'childcareNeed':
      return field.type === 'yes_no_maybe'
        ? typeof value === 'string' && value !== ''
          ? value
          : empty
        : chosenOption(field, value, empty);
    default:
      if (typeof value !== 'string') return empty;
      return value.trim() === '' && options.asTyped !== true ? null : value;
  }
}

/** A chosen key as its option's id; a key no option has travels as it is, so it is refused. */
function chosenOption(
  field: SystemField,
  value: unknown,
  empty: CustomAnswerValue | null,
): CustomAnswerValue | null {
  if (typeof value !== 'string' || value === '') return empty;
  return optionIdOf(field, value) ?? value;
}

/**
 * The needs she chose (option ids) and one details text, from the value the
 * screens keep. Text from before the needs were structured reads as another
 * circumstance. A detail per category (an older draft) joins her explanation,
 * each named by its category in Catalan when there are several, as the
 * RAPP-660 copy did.
 */
export function supportNeedsAnswerParts(
  index: SystemFieldIndex,
  value: unknown,
): { readonly needs: readonly string[] | null; readonly details: string | null } {
  if (typeof value !== 'string' || value.trim() === '') return { needs: null, details: null };
  const field = index.get('specific_needs');
  const options = field?.options ?? [];
  const idOf = (key: string) => (field === undefined ? key : (optionIdOf(field, key) ?? key));
  const answer = decodeSupportNeeds(value);
  if (answer === null) return { needs: [idOf('other')], details: value.trim() };
  const parts = [
    { category: null as string | null, position: 0, body: answer.explanation?.trim() ?? '' },
    ...Object.entries(answer.details).map(([category, body]) => {
      const position = options.findIndex((option) => option.key === category);
      return {
        category: options[position]?.label.ca ?? null,
        position: position + 1,
        body: (body ?? '').trim(),
      };
    }),
  ]
    .filter((part) => part.body !== '')
    .sort((a, b) => a.position - b.position);
  const details = parts
    .map((part) =>
      parts.length > 1 && part.category !== null ? `${part.category}: ${part.body}` : part.body,
    )
    .join('\n\n');
  return {
    needs: answer.categories.map(idOf),
    details: details === '' || answer.categories.includes('none') ? null : details,
  };
}

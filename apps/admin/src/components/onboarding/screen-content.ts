/**
 * What one onboarding screen shows on her phone, in one language (RAPP-641):
 * its title, intro and help line, its questions as controls of their type,
 * and its buttons. The board draws a miniature from it and the screen editor
 * a phone; both read the same wording rules her app uses: staff text in
 * exactly that language, else the app's own text.
 *
 * Neither is the app pixel for pixel. "Preview as player" shows the real one.
 */

import type { PreviewDraft } from '@/components/settings/question-type-fields';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import {
  BUNDLED_SCREEN_TEXT_KEYS,
  INTAKE_QUESTION_LABEL_KEYS,
  isRequiredQuestion,
  resolveAppTerms,
  screenTextFields,
  WIZARD_SCREEN_QUESTIONS,
  type EditableWizardScreen,
  type IntakeQuestion,
  type ScreenTextField,
} from '@ramassa/shared/intake';
import {
  builtinField,
  builtinHelp,
  builtinLabel,
  fieldById,
  formBlocksOn,
  formBlockText,
  hiddenBuiltinQuestions,
  isCustomQuestionRequired,
  liveOptions,
  onboardingScreenQuestions,
  placementOn,
  placementWordingIn,
  requiredBuiltinQuestions,
  screenSettingsFor,
  textIn,
  type BuilderText,
  type CustomQuestion,
  type CustomQuestionType,
  type FormBlock,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import type { BoardStep } from './board-steps';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface PhoneQuestion {
  readonly id: string;
  readonly label: string;
  readonly help: string;
  readonly isRequired: boolean;
  readonly draft: PreviewDraft;
  /** A signature block (RAPP-690): its text, then an empty box to sign in. */
  readonly isSignature?: boolean;
}

export interface PhoneContent {
  readonly title: string;
  readonly intro: string;
  readonly help: string;
  readonly questions: readonly PhoneQuestion[];
  /** Lines of text the screen shows instead of questions: the terms' points, a note. */
  readonly lines: readonly string[];
  readonly checkbox: string | null;
  readonly signature: boolean;
  readonly continueLabel: string;
  readonly declineLabel: string | null;
}

/** The control her phone shows for each built-in question, close enough to spot it. */
const BUILTIN_TYPES: Readonly<Record<IntakeQuestion, CustomQuestionType>> = {
  first_name: 'short_text',
  last_name: 'short_text',
  date_of_birth: 'date',
  place_of_birth: 'search_choice',
  nationality: 'search_choice',
  preferred_language: 'single_choice',
  document: 'single_choice',
  phone: 'phone',
  address: 'short_text',
  city: 'search_choice',
  postal_code: 'short_text',
  reference_entity: 'search_choice',
  reference_contact_name: 'short_text',
  dependents: 'yes_no',
  clothing_size: 'search_choice',
  shoe_size: 'search_choice',
  avatar: 'file_upload',
  applicant_status: 'single_choice',
  supporting_entities: 'item_list',
  season_number: 'number',
  childcare_need: 'single_choice',
  specific_needs: 'search_choice',
};

/** The control her phone shows for a built-in question; the type icon of its row. */
export function builtinQuestionType(question: IntakeQuestion): CustomQuestionType {
  return BUILTIN_TYPES[question];
}

/** One language as localized text, so the shared control reads it as typed. */
function only(language: LanguageCode, text: string): BuilderText {
  return { [language]: text } as BuilderText;
}

/**
 * The options of a built-in question on her phone: the live options of its
 * field, by their labels in her language (RAPP-664); her app language lists
 * the app's languages.
 */
function builtinOptionLabels(
  catalog: IntakeCatalog,
  question: IntakeQuestion,
  language: LanguageCode,
): readonly string[] {
  if (question === 'preferred_language') {
    return SUPPORTED_LANGUAGES.map((code) => LANGUAGE_NATIVE_NAMES[code]);
  }
  const field = catalog.layout === undefined ? undefined : builtinField(catalog.layout, question);
  return (field?.options ?? [])
    .filter((option) => !option.isArchived)
    .map((option) => textIn(option.label, language));
}

/** A built-in question on her phone. `label` is a label typed in an open form, if any. */
export function builtinPhoneQuestion(
  catalog: IntakeCatalog,
  question: IntakeQuestion,
  language: LanguageCode,
  t: Translate,
  label?: BuilderText,
): PhoneQuestion {
  const inLanguage: Translate = (key, options) => t(key, { ...options, lng: language });
  const appLabel = inLanguage(INTAKE_QUESTION_LABEL_KEYS[question] ?? question);
  const typed = label?.[language]?.trim() ?? '';
  const shownLabel =
    label === undefined
      ? (builtinLabel(catalog, question, language) ?? appLabel)
      : typed || appLabel;
  const field = catalog.layout === undefined ? undefined : builtinField(catalog.layout, question);
  // A yes, no or maybe field draws its own three answers.
  const isYesNo = field?.type === 'yes_no' || field?.type === 'yes_no_maybe';
  return {
    id: question,
    label: shownLabel,
    help: builtinHelp(catalog, question, language) ?? '',
    isRequired: isRequiredQuestion(question, requiredBuiltinQuestions(catalog)),
    draft: {
      type: isYesNo ? field.type : BUILTIN_TYPES[question],
      label: only(language, shownLabel),
      help: {},
      settings: {},
      options: builtinOptionLabels(catalog, question, language).map((text) => only(language, text)),
    },
  };
}

/** A staff question on her phone. */
export function customPhoneQuestion(
  question: CustomQuestion,
  language: LanguageCode,
): PhoneQuestion {
  return {
    id: question.id,
    label: textIn(question.label, language),
    help: textIn(question.help, language),
    isRequired: isCustomQuestionRequired(question),
    draft: {
      type: question.type,
      label: question.label,
      help: question.help ?? {},
      settings: question.settings,
      options: liveOptions(question).map((option) => option.label),
    },
  };
}

/**
 * A wording typed in an open placement row, in place of the saved one. For a
 * signature block (RAPP-690) `fieldId` is the block's id and `label` its text.
 */
export interface TypedWording {
  readonly fieldId: string;
  readonly label: BuilderText;
  readonly help: BuilderText;
}

/**
 * The fields her phone asks on one screen (an app screen's key or a Ramassà
 * screen's id) after its own questions, in their order, worded as their
 * placements say: the same shared reader her app plans with (RAPP-655).
 * `typed` is the wording of one open placement row, shown as typed.
 */
export function placedPhoneQuestions(
  catalog: IntakeCatalog,
  screenKey: string,
  language: LanguageCode,
  typed: TypedWording | null = null,
): PhoneQuestion[] {
  const layout = catalog.layout;
  const fields = onboardingScreenQuestions(catalog, screenKey).map((question) => {
    const shown = customPhoneQuestion(question, language);
    const field = layout === undefined ? undefined : fieldById(layout, question.id);
    const saved = layout === undefined ? undefined : placementOn(layout, question.id, 'onboarding');
    if (typed?.fieldId !== question.id || field === undefined || saved === undefined) return shown;
    const wording = placementWordingIn(
      { ...saved, labelOverride: typed.label, helpOverride: typed.help },
      field,
      language,
    );
    return {
      ...shown,
      label: wording.label,
      help: wording.help,
      draft: {
        ...shown.draft,
        label: only(language, wording.label),
        help: only(language, wording.help),
      },
    };
  });
  // Her signature blocks among the fields, in the order they share (RAPP-690).
  const order = (id: string) =>
    (layout === undefined ? undefined : placementOn(layout, id, 'onboarding')?.sortOrder) ??
    Number.POSITIVE_INFINITY;
  const shown: PhoneQuestion[] = [];
  const blocks = [...formBlocksOn(catalog.blocks, 'onboarding', screenKey)];
  for (const question of fields) {
    while (blocks.length > 0 && (blocks[0]?.sortOrder ?? 0) < order(question.id)) {
      shown.push(signaturePhoneQuestion(blocks.shift() as FormBlock, language, typed));
    }
    shown.push(question);
  }
  return [...shown, ...blocks.map((block) => signaturePhoneQuestion(block, language, typed))];
}

/** The signature blocks of one screen on her phone, in their order (RAPP-690). */
export function signaturePhoneQuestions(
  catalog: IntakeCatalog,
  screenKey: string,
  language: LanguageCode,
): PhoneQuestion[] {
  return formBlocksOn(catalog.blocks, 'onboarding', screenKey).map((block) =>
    signaturePhoneQuestion(block, language, null),
  );
}

/** A signature block on her phone: its text, typed or saved, and the box. */
function signaturePhoneQuestion(
  block: FormBlock,
  language: LanguageCode,
  typed: TypedWording | null,
): PhoneQuestion {
  const body = typed?.fieldId === block.id ? typed.label : block.body;
  return {
    id: block.id,
    label: formBlockText({ body }, language).text,
    help: '',
    isRequired: true,
    isSignature: true,
    draft: { type: 'short_text', label: {}, help: {}, settings: {}, options: [] },
  };
}

/** The built-in questions a screen asks, without the ones staff hid. */
function builtinScreenQuestions(
  catalog: IntakeCatalog,
  screen: keyof typeof WIZARD_SCREEN_QUESTIONS,
): readonly IntakeQuestion[] {
  const hidden = hiddenBuiltinQuestions(catalog);
  return WIZARD_SCREEN_QUESTIONS[screen].filter((question) => !hidden.has(question));
}

export type ScreenTexts = Readonly<Partial<Record<ScreenTextField, BuilderText>>>;

/** A built-in screen's wording in one language: staff text, else the app's. */
export function builtinWording(
  screen: EditableWizardScreen,
  texts: ScreenTexts,
  language: LanguageCode,
  t: Translate,
): Readonly<Record<ScreenTextField, string>> {
  const fields = screenTextFields(screen);
  const shown = (field: ScreenTextField): string => {
    if (!fields.includes(field)) return '';
    const staff = texts[field]?.[language]?.trim() ?? '';
    if (staff !== '') return staff;
    const key = BUNDLED_SCREEN_TEXT_KEYS[screen][field];
    return key === undefined ? '' : t(`onboarding:${key}`, { lng: language });
  };
  return {
    title: shown('title'),
    intro: shown('intro'),
    help: shown('help'),
    continue_label: shown('continue_label'),
    decline_label: shown('decline_label'),
  };
}

export interface ContentOverrides {
  /** Wording typed in the editor, in place of the saved wording. */
  readonly texts?: ScreenTexts;
  /** A staff screen's title and intro as typed. */
  readonly title?: BuilderText;
  readonly intro?: BuilderText;
  /** The questions as the editor shows them, in place of the saved ones. */
  readonly questions?: readonly PhoneQuestion[];
  /** The note under the document step (RAPP-302). */
  readonly documentNote?: string;
  /** The current season's name, for the authorization title. */
  readonly seasonName?: string;
}

export function stepContent(
  catalog: IntakeCatalog,
  step: BoardStep,
  language: LanguageCode,
  t: Translate,
  overrides: ContentOverrides = {},
): PhoneContent {
  const phone = (key: string, options: Record<string, unknown> = {}) =>
    t(`onboarding:${key}`, { ...options, lng: language });
  const empty = {
    help: '',
    questions: [],
    lines: [],
    checkbox: null,
    signature: false,
    declineLabel: null,
  } as const;

  if (step.kind === 'custom') {
    const screen = step.screen;
    return {
      ...empty,
      title: textIn(overrides.title ?? screen.title, language),
      intro: textIn(overrides.intro ?? screen.intro, language),
      questions: overrides.questions ?? placedPhoneQuestions(catalog, screen.id, language),
      continueLabel: phone('continueAction'),
    };
  }

  if (step.key === 'authorization') {
    return {
      ...empty,
      title: phone('seasonAuthorizationFlow', { season: overrides.seasonName ?? '' }).trim(),
      intro: '',
      lines: [phone('authorizationConsentsTitle')],
      checkbox: phone('authorizationRequiredMark'),
      signature: true,
      continueLabel: phone('authorizationSignAction'),
    };
  }

  const texts = overrides.texts ?? screenSettingsFor(catalog, step.key)?.texts ?? {};
  const wording = builtinWording(step.key, texts, language, t);
  const base = {
    ...empty,
    title: wording.title,
    intro: wording.intro,
    help: wording.help,
    continueLabel: wording.continue_label,
    declineLabel: wording.decline_label === '' ? null : wording.decline_label,
  };

  if (step.key === 'terms-intro' || step.key === 'terms') {
    // Their title and intro are the app terms' own (RAPP-613).
    const terms =
      catalog.terms === null || catalog.terms === undefined
        ? null
        : resolveAppTerms(catalog.terms.content, language);
    return step.key === 'terms'
      ? {
          ...base,
          title: terms?.title ?? '',
          intro: terms?.mediaHint ?? '',
          lines: terms === null ? [] : [terms.body.split('\n')[0] ?? ''],
          checkbox: terms?.acceptLabel ?? null,
        }
      : {
          ...base,
          title: terms?.introTitle ?? '',
          intro: terms?.intro ?? '',
          lines: terms?.points.map((point) => point.title) ?? [],
        };
  }

  if (step.key === 'summary') {
    return { ...base, lines: [phone('summarySectionName')] };
  }

  return {
    ...base,
    questions: overrides.questions ?? [
      ...builtinScreenQuestions(catalog, step.key).map((question) =>
        builtinPhoneQuestion(catalog, question, language, t),
      ),
      // Then the fields staff placed on it (RAPP-642, RAPP-651).
      ...placedPhoneQuestions(catalog, step.key, language),
    ],
    lines:
      step.key === 'documentation' && (overrides.documentNote ?? '') !== ''
        ? [overrides.documentNote ?? '']
        : [],
  };
}

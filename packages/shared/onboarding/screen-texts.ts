/**
 * The wording of the built-in wizard screens that staff edit (RAPP-612).
 *
 * Each built-in screen has a title, an intro, an optional help line and its
 * button labels, bundled in the app's five languages. Staff write their own
 * per language in the admin; a language they never wrote shows the bundled
 * text in her language (RAPP-710). The intro and the help line are optional:
 * staff may clear them, and that language then shows none. The title and the
 * buttons are required, so a screen is never blank. Validation messages are
 * not here: they stay in the app (spec guard).
 *
 * The introduction to the terms and the terms screen take their title and
 * intro from the app terms version (RAPP-613), which is legal text with its
 * own versions, so only their help line and buttons are edited here.
 *
 * The database mirrors `screenTextFields` in the block marked
 * `builtin-screen-text-fields` (a parity test reads it).
 */
import type { WizardQuestionScreen } from './intake';
import { conditionHolds } from './screen-conditions';
import type { SystemFieldKey } from './system-fields';

export const EDITABLE_WIZARD_SCREENS = [
  'identity',
  'background',
  'documentation',
  // The document follow-up, one screen per answer (RAPP-715).
  'documentation-nie',
  'documentation-passport',
  'documentation-other',
  'logistics',
  'equipment',
  'season',
  'applicant-status-details',
  'supporting-entities',
  'participation-support',
  'specific-needs',
  'specific-needs-details',
  'summary',
  'terms-intro',
  'terms',
] as const;
export type EditableWizardScreen = (typeof EDITABLE_WIZARD_SCREENS)[number];

export const SCREEN_TEXT_FIELDS = [
  'title',
  'intro',
  'help',
  'continue_label',
  'decline_label',
] as const;
export type ScreenTextField = (typeof SCREEN_TEXT_FIELDS)[number];

/**
 * The texts her screen can do without (RAPP-710): staff may clear them. The
 * database lists the same fields in `private.screen_text_optional`.
 */
export const OPTIONAL_SCREEN_TEXT_FIELDS: readonly ScreenTextField[] = ['intro', 'help'];

export function isOptionalScreenTextField(field: ScreenTextField): boolean {
  return OPTIONAL_SCREEN_TEXT_FIELDS.includes(field);
}

const QUESTION_SCREEN_FIELDS: readonly ScreenTextField[] = [
  'title',
  'intro',
  'help',
  'continue_label',
];

/** The fields staff may write for a screen. */
export function screenTextFields(screen: EditableWizardScreen): readonly ScreenTextField[] {
  if (screen === 'terms-intro') return ['help', 'continue_label'];
  if (screen === 'terms') return ['help', 'continue_label', 'decline_label'];
  return QUESTION_SCREEN_FIELDS;
}

/**
 * The bundled text of each field, as `onboarding` translation keys: what the
 * phone shows when staff wrote nothing, and what the admin preview falls back
 * to. A detail screen whose title depends on her answer lists one example.
 */
export const BUNDLED_SCREEN_TEXT_KEYS: Readonly<
  Record<EditableWizardScreen, Readonly<Partial<Record<ScreenTextField, string>>>>
> = {
  identity: { title: 'identityTitle', continue_label: 'continueAction' },
  background: { title: 'backgroundTitle', continue_label: 'continueAction' },
  documentation: {
    title: 'documentationTitle',
    intro: 'documentationIntro',
    continue_label: 'continueAction',
  },
  'documentation-nie': { title: 'documentNieNumberTitle', continue_label: 'continueAction' },
  'documentation-passport': {
    title: 'documentPassportNumberTitle',
    continue_label: 'continueAction',
  },
  'documentation-other': { title: 'documentOtherDetailsTitle', continue_label: 'continueAction' },
  logistics: { title: 'logisticsTitle', intro: 'logisticsIntro', continue_label: 'continueAction' },
  equipment: { title: 'equipmentTitle', intro: 'equipmentIntro', continue_label: 'continueAction' },
  season: { title: 'currentSituationTitle', continue_label: 'continueAction' },
  'applicant-status-details': { title: 'otherSituationTitle', continue_label: 'continueAction' },
  'supporting-entities': {
    title: 'supportingOrganisationsTitle',
    continue_label: 'continueAction',
  },
  'participation-support': { title: 'participationSupportTitle', continue_label: 'continueAction' },
  'specific-needs': {
    title: 'supportNeedsTitle',
    intro: 'supportNeedsChooseMultiple',
    continue_label: 'continueAction',
  },
  'specific-needs-details': {
    title: 'supportNeedAccessibilityQuestion',
    continue_label: 'continueAction',
  },
  summary: { title: 'summaryTitle', intro: 'summaryIntro', continue_label: 'summaryConfirmAction' },
  'terms-intro': { continue_label: 'termsReadFullAction' },
  terms: { continue_label: 'finishAction', decline_label: 'termsDeclineAction' },
};

/**
 * When one of the app's follow-up screens opens (RAPP-713, RAPP-715): her
 * answer to an app field is one of `answers`, by the options' stable keys.
 * It is the model every screen uses (`screen-conditions.ts`), with the app's
 * field and options named by key, because their ids belong to each
 * organization: `appBranchCondition` (intake-builder) reads them as ids.
 * `repeatsPerAnswer`: the screen shows once for each answer she ticks.
 */
export interface AppBranchCondition {
  readonly field: SystemFieldKey;
  readonly answers: readonly string[];
  readonly repeatsPerAnswer?: boolean;
}

/** A follow-up screen of the app, the screen it opens from and when it opens. */
export interface DetailScreenBranch {
  readonly screen: EditableWizardScreen;
  readonly parent: WizardQuestionScreen;
  readonly condition: AppBranchCondition;
}

/**
 * The app's own follow-up screens, in her order: the board, the screen
 * editor and her phone read them, so the three agree. The document follow-up
 * is one screen per answer (RAPP-715).
 */
export const DETAIL_SCREEN_BRANCHES = [
  {
    screen: 'documentation-nie',
    parent: 'documentation',
    condition: { field: 'document_type', answers: ['nie'] },
  },
  {
    screen: 'documentation-passport',
    parent: 'documentation',
    condition: { field: 'document_type', answers: ['passport'] },
  },
  {
    screen: 'documentation-other',
    parent: 'documentation',
    condition: { field: 'document_type', answers: ['other'] },
  },
  {
    screen: 'applicant-status-details',
    parent: 'season',
    condition: { field: 'applicant_status', answers: ['other'] },
  },
  {
    screen: 'specific-needs-details',
    parent: 'specific-needs',
    condition: {
      field: 'specific_needs',
      answers: ['accessibility', 'health', 'communication', 'wellbeing', 'other'],
      repeatsPerAnswer: true,
    },
  },
] as const satisfies readonly DetailScreenBranch[];

export type DetailScreen = (typeof DETAIL_SCREEN_BRANCHES)[number]['screen'];

/** The detail screens that open from a question screen, and the screen they belong to. */
export const DETAIL_SCREEN_PARENTS: Readonly<
  Partial<Record<EditableWizardScreen, WizardQuestionScreen>>
> = Object.fromEntries(DETAIL_SCREEN_BRANCHES.map((branch) => [branch.screen, branch.parent]));

/** The app's follow-up screens of one screen, in her order. */
export function detailScreensOf(
  parent: string,
): readonly (typeof DETAIL_SCREEN_BRANCHES)[number][] {
  return DETAIL_SCREEN_BRANCHES.filter((branch) => branch.parent === parent);
}

/** Whether her answer (by option key, as her app screens keep it) opens this follow-up. */
export function opensDetailScreen(screen: DetailScreen, answer: unknown): boolean {
  const branch = DETAIL_SCREEN_BRANCHES.find((each) => each.screen === screen);
  return branch !== undefined && conditionHolds(branch.condition.answers, answer);
}

/** The document follow-up her answer opens, or null for none (RAPP-715). */
export function documentDetailScreen(answer: unknown): DetailScreen | null {
  const branch = DETAIL_SCREEN_BRANCHES.find(
    (each) => each.parent === 'documentation' && conditionHolds(each.condition.answers, answer),
  );
  return branch?.screen ?? null;
}

export function isEditableWizardScreen(screen: string): screen is EditableWizardScreen {
  return (EDITABLE_WIZARD_SCREENS as readonly string[]).includes(screen);
}

/**
 * The editable screen a wizard frame shows, from its stable id: every support
 * need detail screen shares one wording, a staff screen has its own (none).
 */
export function editableScreenOf(screenId: string | undefined): EditableWizardScreen | null {
  if (screenId === undefined) return null;
  if (screenId.startsWith('needs-detail:')) return 'specific-needs-details';
  return isEditableWizardScreen(screenId) ? screenId : null;
}

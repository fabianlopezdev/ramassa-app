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
import type { IntakeQuestion, WizardQuestionScreen } from './intake';

export const EDITABLE_WIZARD_SCREENS = [
  'identity',
  'background',
  'documentation',
  'documentation-details',
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
  'documentation-details': { title: 'documentNieNumberTitle', continue_label: 'continueAction' },
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
 * When a follow-up screen opens after its screen (RAPP-713): her answer to
 * `question` is one of `values`, or one follow-up for each answer she ticks.
 * The phone and the board's branch cards read the same rule, so the board's
 * condition line is what her phone does. A branch the team makes later can
 * use the same shape.
 */
export type BranchCondition =
  | {
      readonly kind: 'answer-in';
      readonly question: IntakeQuestion;
      readonly values: readonly string[];
    }
  | { readonly kind: 'each-answer'; readonly question: IntakeQuestion };

/** A follow-up screen, the screen it opens from and when it opens. */
export interface DetailScreenBranch {
  readonly screen: EditableWizardScreen;
  readonly parent: WizardQuestionScreen;
  readonly condition: BranchCondition;
}

/** The app's built-in follow-up screens, in her order. */
export const DETAIL_SCREEN_BRANCHES = [
  {
    screen: 'documentation-details',
    parent: 'documentation',
    condition: { kind: 'answer-in', question: 'document', values: ['nie', 'passport', 'other'] },
  },
  {
    screen: 'applicant-status-details',
    parent: 'season',
    condition: { kind: 'answer-in', question: 'applicant_status', values: ['other'] },
  },
  {
    screen: 'specific-needs-details',
    parent: 'specific-needs',
    condition: { kind: 'each-answer', question: 'specific_needs' },
  },
] as const satisfies readonly DetailScreenBranch[];

/** The detail screens that open from a question screen, and the screen they belong to. */
export const DETAIL_SCREEN_PARENTS: Readonly<
  Partial<Record<EditableWizardScreen, WizardQuestionScreen>>
> = Object.fromEntries(DETAIL_SCREEN_BRANCHES.map((branch) => [branch.screen, branch.parent]));

/** Whether her answer opens the follow-up: one answer among the values, or any answer ticked. */
export function branchOpens(condition: BranchCondition, answer: unknown): boolean {
  if (condition.kind === 'each-answer') return Array.isArray(answer) && answer.length > 0;
  return typeof answer === 'string' && condition.values.includes(answer);
}

/** Whether her answer opens this built-in follow-up screen, as her phone decides. */
export function opensDetailScreen(
  screen: (typeof DETAIL_SCREEN_BRANCHES)[number]['screen'],
  answer: unknown,
): boolean {
  const branch = DETAIL_SCREEN_BRANCHES.find((each) => each.screen === screen);
  return branch !== undefined && branchOpens(branch.condition, answer);
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

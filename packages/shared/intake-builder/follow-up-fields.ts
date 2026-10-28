/**
 * The app's follow-up screens as their placements say (RAPP-720): which of
 * their own fields each one draws and requires, the wording staff gave them,
 * and the other fields each holds, for her phone, her summary and the staff
 * previews alike. `onboarding/follow-ups.ts` says which fields are a
 * follow-up's own.
 */
import {
  DEFAULT_FOLLOW_UP_ASKING,
  FOLLOW_UP_OWN_FIELDS,
  FOLLOW_UP_SCREENS,
  type FollowUpAsking,
  type OwnFieldAsking,
} from '../onboarding/follow-ups';
import { conditionsHold } from '../onboarding/screen-conditions';
import { DETAIL_SCREEN_BRANCHES, type DetailScreen } from '../onboarding/screen-texts';
import { SYSTEM_FIELD_QUESTIONS, type SystemFieldKey } from '../onboarding/system-fields';
import type { LanguageCode } from '../schemas/language';
import { questionsOffTheirControl } from './app-controls';
import type { IntakeCatalog, IntakeScreen } from './builder';
import { consentsOn } from './consents';
import { hasSignatureBlocks } from './form-blocks';
import { onboardingScreenQuestions } from './her-onboarding';
import { placementsOnSurface, type FieldPlacement, type ProfileField } from './profile-layout';
import { appBranchCondition, detailBranch } from './screen-branches';

/** An own field of a follow-up as it is placed there, in the screen's order. */
export interface PlacedOwnField {
  readonly key: SystemFieldKey;
  readonly field: ProfileField;
  readonly placement: FieldPlacement;
}

/** A catalog with no app field at all (an older one, a test) reads as each follow-up starts. */
function hasAppFields(catalog: IntakeCatalog): boolean {
  return catalog.layout?.fields.some((field) => field.systemKey != null) === true;
}

/**
 * The own fields a follow-up's control draws, as placed there, in order. A
 * question asked off its own control (RAPP-665) draws none: the generic
 * renderer asks its fields where they are placed.
 */
export function placedOwnFields(
  catalog: IntakeCatalog,
  screen: DetailScreen,
): readonly PlacedOwnField[] {
  const layout = catalog.layout;
  if (layout === undefined) return [];
  const offTheirControl = questionsOffTheirControl(layout);
  const own = new Set<string>(FOLLOW_UP_OWN_FIELDS[screen].map((field) => field.key));
  return placementsOnSurface(layout, 'onboarding', screen).flatMap((placement) => {
    const field = layout.fields.find((each) => each.id === placement.fieldId);
    const key = field?.systemKey ?? null;
    if (field === undefined || key === null || !own.has(key)) return [];
    if (offTheirControl.has(SYSTEM_FIELD_QUESTIONS[key])) return [];
    return [{ key, field, placement }];
  });
}

/** What every follow-up asks of its own fields, from the placements (RAPP-720). */
export function followUpAsking(catalog: IntakeCatalog): FollowUpAsking {
  if (!hasAppFields(catalog)) return DEFAULT_FOLLOW_UP_ASKING;
  return Object.fromEntries(
    FOLLOW_UP_SCREENS.map((screen) => [
      screen,
      Object.fromEntries(
        placedOwnFields(catalog, screen).map((own): [SystemFieldKey, OwnFieldAsking] => [
          own.key,
          own.placement.required ? 'required' : 'optional',
        ]),
      ),
    ]),
  ) as FollowUpAsking;
}

/**
 * The wording staff gave an own field on a follow-up, in her language; null
 * when they gave none there, and her phone shows the app's own label.
 */
export function ownFieldWording(
  catalog: IntakeCatalog,
  screen: DetailScreen,
  key: SystemFieldKey,
  language: LanguageCode,
): { readonly label: string | null; readonly help: string | null } {
  const own = placedOwnFields(catalog, screen).find((each) => each.key === key);
  const written = (text: string | undefined) =>
    text === undefined || text.trim() === '' ? null : text;
  return {
    label: written(own?.placement.labelOverride?.[language]),
    help: written(own?.placement.helpOverride?.[language]),
  };
}

/** The group of fields her phone asks on a follow-up after its own ones; undefined when none. */
export function followUpGroupOf(
  screens: readonly IntakeScreen[],
  screen: DetailScreen,
): IntakeScreen | undefined {
  return screens.find((candidate) => candidate.builtinScreen === screen);
}

/** Whether a follow-up opens for her answers by field id (stored, her draft over them). */
export function followUpOpens(
  catalog: IntakeCatalog,
  screen: DetailScreen,
  answers: Readonly<Record<string, unknown>>,
): boolean {
  const condition = appBranchCondition(catalog, detailBranch(screen));
  return condition !== null && conditionsHold([condition], answers);
}

/** The follow-ups her answers do not open: what they hold is never asked nor sent. */
export function closedFollowUps(
  catalog: IntakeCatalog,
  answers: Readonly<Record<string, unknown>>,
): ReadonlySet<DetailScreen> {
  return new Set(
    DETAIL_SCREEN_BRANCHES.filter((branch) => !followUpOpens(catalog, branch.screen, answers)).map(
      (branch) => branch.screen,
    ),
  );
}

/**
 * Whether a follow-up asks her anything: one of its own fields, another
 * field, a signature or a consent. One that holds nothing never shows, and
 * the board does not count it. A catalog with no layout reads as each
 * follow-up starts.
 */
export function followUpAsksSomething(catalog: IntakeCatalog, screen: DetailScreen): boolean {
  if (!hasAppFields(catalog)) return true;
  return (
    placedOwnFields(catalog, screen).length > 0 ||
    onboardingScreenQuestions(catalog, screen).length > 0 ||
    hasSignatureBlocks(catalog.blocks, screen) ||
    consentsOn(catalog, 'onboarding', screen).length > 0
  );
}

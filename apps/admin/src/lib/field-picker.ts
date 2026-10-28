/**
 * What the field picker (RAPP-651) needs to know about the Fitxa, pure so it
 * is tested without a database.
 *
 *   - which fields a search finds, in any of the five languages, accents and
 *     case ignored;
 *   - a conditional field travels with the field it depends on: ticking one
 *     ticks its controlling field when that one can be picked too, and the
 *     controlling field is placed first (the database checks it is there);
 *   - for her onboarding: whether a field is on this screen already, asked on
 *     another one, or free, and which section the picker opens on.
 */

import { SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import {
  canShareField,
  DETAIL_SCREEN_PARENTS,
  followUpsOfOwnField,
  isFollowUpScreen,
  WIZARD_SCREEN_QUESTIONS,
  type WizardQuestionScreen,
} from '@ramassa/shared/intake';
import {
  builtinField,
  fieldById,
  placementsOnSurface,
  type ProfileField,
  type ProfileLayout,
} from '@ramassa/shared/intake-builder';

// Diacritic also covers the Catalan middle dot, so "allergies" finds "Al·lèrgies".
function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\p{M}\p{Diacritic}]/gu, '')
    .toLocaleLowerCase('ca')
    .trim();
}

/** The live fields whose name, in any language, holds the search. */
export function searchFields(layout: ProfileLayout, query: string): readonly ProfileField[] {
  const wanted = folded(query);
  return layout.fields.filter(
    (field) =>
      !field.isArchived &&
      wanted !== '' &&
      SUPPORTED_LANGUAGES.some((language) => folded(field.label[language] ?? '').includes(wanted)),
  );
}

/**
 * The picked ids after one field is toggled. Picking a conditional field picks
 * the field it depends on when `canPick` allows it; dropping a field drops
 * the picked fields that depend on it.
 */
export function togglePick(
  layout: ProfileLayout,
  picked: ReadonlySet<string>,
  fieldId: string,
  canPick: (id: string) => boolean,
): ReadonlySet<string> {
  const next = new Set(picked);
  if (next.has(fieldId)) {
    const drop = (id: string) => {
      next.delete(id);
      layout.fields
        .filter((field) => field.showWhen?.fieldId === id && next.has(field.id))
        .forEach((field) => drop(field.id));
    };
    drop(fieldId);
    return next;
  }
  let current = fieldById(layout, fieldId);
  while (current !== undefined) {
    next.add(current.id);
    const controller: string | undefined = current.showWhen?.fieldId;
    current =
      controller !== undefined && !next.has(controller) && canPick(controller)
        ? fieldById(layout, controller)
        : undefined;
  }
  return next;
}

/** The ids in an order the database takes: a controlling field before its conditions. */
export function controllersFirst(layout: ProfileLayout, ids: readonly string[]): readonly string[] {
  const depth = (id: string, seen = new Set<string>()): number => {
    const controller = fieldById(layout, id)?.showWhen?.fieldId;
    if (controller === undefined || seen.has(controller)) return 0;
    seen.add(controller);
    return 1 + depth(controller, seen);
  };
  return [...ids].sort((a, b) => depth(a) - depth(b));
}

// Her onboarding --------------------------------------------------------------------------------

/** Where a field stands for one onboarding screen. */
export type OnboardingPick =
  | { readonly kind: 'here' }
  /** On another screen, at that screen's key (an app screen or a Ramassà screen's id). */
  | { readonly kind: 'elsewhere'; readonly screenKey: string | null }
  /** A condition whose controlling field is asked on another screen. */
  | { readonly kind: 'withController'; readonly controllerId: string }
  /** An app field a follow-up's own control draws (RAPP-720): only on those follow-ups. */
  | { readonly kind: 'followUpOnly' }
  | { readonly kind: 'free' };

export function onboardingPick(
  layout: ProfileLayout,
  field: ProfileField,
  screenKey: string,
): OnboardingPick {
  const placements = layout.placements.filter(
    (placement) => placement.fieldId === field.id && placement.surface === 'onboarding',
  );
  if (placements.some((placement) => placement.screenKey === screenKey)) return { kind: 'here' };
  // A field may sit on every sibling follow-up of one question (RAPP-720).
  const blocking = placements.find((placement) => !canShareField(placement.screenKey, screenKey));
  if (blocking !== undefined) return { kind: 'elsewhere', screenKey: blocking.screenKey };
  const follows = followUpsOfOwnField(field.systemKey);
  if (follows.length > 0 && !(follows as readonly string[]).includes(screenKey)) {
    return { kind: 'followUpOnly' };
  }
  const controllerId = field.showWhen?.fieldId;
  if (controllerId !== undefined) {
    const controller = fieldById(layout, controllerId);
    const where =
      controller === undefined ? undefined : onboardingPick(layout, controller, screenKey).kind;
    // A follow-up opens on an answer of the screen it follows: its question may be there.
    const parent = isFollowUpScreen(screenKey) ? DETAIL_SCREEN_PARENTS[screenKey] : undefined;
    const onParent =
      parent !== undefined &&
      layout.placements.some(
        (placement) =>
          placement.fieldId === controllerId &&
          placement.surface === 'onboarding' &&
          placement.screenKey === parent,
      );
    if (where !== 'here' && where !== 'free' && !onParent) {
      return { kind: 'withController', controllerId };
    }
  }
  return { kind: 'free' };
}

/**
 * The section the picker opens on: the section of the screen's first field
 * (an app screen's own fields first), else the first section.
 */
export function pickerSectionFor(layout: ProfileLayout, screenKey: string): string | null {
  const own =
    screenKey in WIZARD_SCREEN_QUESTIONS
      ? WIZARD_SCREEN_QUESTIONS[screenKey as WizardQuestionScreen].flatMap((question) => {
          const field = builtinField(layout, question);
          return field === undefined ? [] : [field];
        })
      : [];
  const placed = placementsOnSurface(layout, 'onboarding', screenKey).flatMap((placement) => {
    const field = fieldById(layout, placement.fieldId);
    return field === undefined ? [] : [field];
  });
  const first = [...own, ...placed][0];
  return first?.sectionId ?? layout.sections[0]?.id ?? null;
}

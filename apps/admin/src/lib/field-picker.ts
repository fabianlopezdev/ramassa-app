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
import { WIZARD_SCREEN_QUESTIONS, type WizardQuestionScreen } from '@ramassa/shared/intake';
import {
  builtinField,
  fieldById,
  placementOn,
  placementsOnSurface,
  type ProfileField,
  type ProfileLayout,
} from '@ramassa/shared/intake-builder';

function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('ca').trim();
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
  | { readonly kind: 'free' };

export function onboardingPick(
  layout: ProfileLayout,
  field: ProfileField,
  screenKey: string,
): OnboardingPick {
  const placement = placementOn(layout, field.id, 'onboarding');
  if (placement !== undefined) {
    return placement.screenKey === screenKey
      ? { kind: 'here' }
      : { kind: 'elsewhere', screenKey: placement.screenKey };
  }
  // The app asks a built-in field on its own screen only.
  if (field.kind === 'builtin') return { kind: 'elsewhere', screenKey: null };
  const controllerId = field.showWhen?.fieldId;
  if (controllerId !== undefined) {
    const controller = fieldById(layout, controllerId);
    const where =
      controller === undefined ? undefined : onboardingPick(layout, controller, screenKey).kind;
    if (where !== 'here' && where !== 'free') return { kind: 'withController', controllerId };
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

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
 *     another one (adding it moves it here, RAPP-782), or free, and which
 *     section the picker opens on.
 */

import { SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import {
  canShareField,
  DETAIL_SCREEN_BRANCHES,
  followUpsOfOwnField,
  WIZARD_SCREEN_QUESTIONS,
  type DetailScreen,
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

/**
 * Where a field stands for one onboarding screen (RAPP-782): any field goes
 * on any screen, and a field asked on another screen moves here when it is
 * added, with the fields that depend on it. A condition whose controlling
 * field is elsewhere is free: picking it picks that field too, and both move.
 */
export type OnboardingPick =
  | { readonly kind: 'here' }
  /** On another screen, at that screen's key: adding it moves it here. */
  | { readonly kind: 'elsewhere'; readonly screenKey: string | null }
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
  const other = placements.find((placement) => !canShareField(placement.screenKey, screenKey));
  if (other !== undefined) return { kind: 'elsewhere', screenKey: other.screenKey };
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

// What a move does (RAPP-782) ------------------------------------------------------------------

/** One thing that changes when the picked fields and consents are added to a screen. */
export type MoveConsequence =
  /** A picked field leaves the screen it is asked on. */
  | { readonly kind: 'field'; readonly fieldId: string; readonly from: string | null }
  /** A field linked to a picked one by a condition comes along. */
  | {
      readonly kind: 'comesAlong';
      readonly fieldId: string;
      readonly withId: string;
      readonly from: string | null;
    }
  /** The app's follow-ups that open on the question move with it. */
  | {
      readonly kind: 'followUps';
      readonly fieldId: string;
      readonly screens: readonly DetailScreen[];
    }
  /** A follow-up's field is then asked to every player on the screen. */
  | { readonly kind: 'toEveryone'; readonly fieldId: string; readonly from: string }
  /** A screen that opens on an answer to the question moves right after the screen. */
  | { readonly kind: 'dependentScreen'; readonly fieldId: string; readonly screenId: string }
  /** A picked consent leaves the screen it is asked on. */
  | { readonly kind: 'consent'; readonly consentId: string; readonly from: string | null }
  /** A screen left with nothing to ask: players skip it. */
  | { readonly kind: 'emptied'; readonly screenKey: string };

/** The form a move happens on, as the picker knows it. */
export interface MoveContext {
  readonly layout: ProfileLayout;
  readonly surface: 'onboarding' | 'custom_form';
  /** The form, on a form's screen. */
  readonly formId?: string;
  /** The screen the fields are added to. */
  readonly screenKey: string;
  /** The form's screens that open on an answer (RAPP-715). */
  readonly screens: readonly {
    readonly id: string;
    readonly showWhen?: { readonly fieldId: string };
  }[];
  /** Where the form's blocks and consents are. */
  readonly blocks: readonly { readonly screenKey: string | null }[];
  readonly consents: readonly { readonly consentId: string; readonly screenKey: string | null }[];
}

/**
 * Everything adding these fields and consents changes, in the order the
 * admin reads it, as the database does it (`move_field_group`): each field
 * on another screen moves with every field a condition links to it; the
 * follow-ups and screens that open on a moved question follow it; a screen
 * left with nothing is skipped by players.
 */
export function moveConsequences(
  context: MoveContext,
  fieldIds: readonly string[],
  consentIds: readonly string[],
): readonly MoveConsequence[] {
  const { layout, surface, screenKey } = context;
  const isOnboarding = surface === 'onboarding';
  const onForm = layout.placements.filter(
    (placement) =>
      placement.surface === surface && (isOnboarding || placement.customFormId === context.formId),
  );
  const placementsOf = (id: string) => onForm.filter((placement) => placement.fieldId === id);
  // A condition on a follow-up that opens on its controller stays there.
  const followsController = (childId: string, controllerId: string) => {
    if (!isOnboarding) return false;
    const key = fieldById(layout, controllerId)?.systemKey;
    const screens = DETAIL_SCREEN_BRANCHES.filter((branch) => branch.condition.field === key).map(
      (branch) => branch.screen as string,
    );
    const mine = placementsOf(childId);
    return (
      mine.length > 0 && mine.every((placement) => screens.includes(placement.screenKey ?? ''))
    );
  };
  const moves = (id: string) => {
    const mine = placementsOf(id);
    return (
      mine.length > 0 &&
      !mine.some((placement) => placement.screenKey === screenKey) &&
      mine.some((placement) => !canShareField(placement.screenKey, screenKey))
    );
  };
  const familyOf = (id: string): readonly string[] => {
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const own = fieldById(layout, current);
      const linked = [
        ...layout.fields
          .filter(
            (each) => each.showWhen?.fieldId === current && !followsController(each.id, current),
          )
          .map((each) => each.id),
        ...(own?.showWhen !== undefined && !followsController(current, own.showWhen.fieldId)
          ? [own.showWhen.fieldId]
          : []),
      ];
      for (const next of linked) {
        if (seen.has(next) || placementsOf(next).length === 0) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return [...seen];
  };

  const result: MoveConsequence[] = [];
  const moving = new Set<string>();
  const from = (id: string) => placementsOf(id)[0]?.screenKey ?? null;
  for (const id of fieldIds) {
    if (moving.has(id) || !moves(id)) continue;
    for (const member of familyOf(id)) {
      if (moving.has(member) || !moves(member)) continue;
      moving.add(member);
      result.push(
        fieldIds.includes(member)
          ? { kind: 'field', fieldId: member, from: from(member) }
          : { kind: 'comesAlong', fieldId: member, withId: id, from: from(member) },
      );
    }
  }
  for (const id of moving) {
    const field = fieldById(layout, id);
    if (isOnboarding) {
      const screens = DETAIL_SCREEN_BRANCHES.filter(
        (branch) => branch.condition.field === field?.systemKey,
      ).map((branch) => branch.screen);
      if (screens.length > 0) result.push({ kind: 'followUps', fieldId: id, screens });
      const follows = followUpsOfOwnField(field?.systemKey);
      const onFollowUp = placementsOf(id).find((placement) =>
        (follows as readonly (string | null)[]).includes(placement.screenKey),
      );
      if (onFollowUp?.screenKey != null && !(follows as readonly string[]).includes(screenKey)) {
        result.push({ kind: 'toEveryone', fieldId: id, from: onFollowUp.screenKey });
      }
    }
    // The screens that open on its answer, and the ones that open on theirs.
    const dependents = (controller: string, depth = 0): readonly string[] =>
      depth > 64
        ? []
        : context.screens
            .filter((screen) => screen.showWhen?.fieldId === controller)
            .flatMap((screen) => [
              screen.id,
              ...onForm
                .filter((placement) => placement.screenKey === screen.id)
                .flatMap((placement) => dependents(placement.fieldId, depth + 1)),
            ]);
    for (const screenId of new Set(dependents(id))) {
      result.push({ kind: 'dependentScreen', fieldId: id, screenId });
    }
  }
  const movingConsents = consentIds.filter((id) => {
    const placement = context.consents.find((each) => each.consentId === id);
    return placement !== undefined && placement.screenKey !== screenKey;
  });
  for (const id of movingConsents) {
    result.push({
      kind: 'consent',
      consentId: id,
      from: context.consents.find((each) => each.consentId === id)?.screenKey ?? null,
    });
  }
  // A screen of her Onboarding the move leaves with nothing to ask is skipped (RAPP-782).
  if (isOnboarding) {
    const left = new Set(
      [...moving].flatMap((id) => placementsOf(id).map((placement) => placement.screenKey)),
    );
    for (const id of movingConsents) {
      left.add(context.consents.find((each) => each.consentId === id)?.screenKey ?? null);
    }
    for (const source of left) {
      if (source === null || source === screenKey) continue;
      const stays =
        onForm.some(
          (placement) => placement.screenKey === source && !moving.has(placement.fieldId),
        ) ||
        context.blocks.some((block) => block.screenKey === source) ||
        context.consents.some(
          (each) => each.screenKey === source && !movingConsents.includes(each.consentId),
        );
      if (!stays) result.push({ kind: 'emptied', screenKey: source });
    }
  }
  return result;
}

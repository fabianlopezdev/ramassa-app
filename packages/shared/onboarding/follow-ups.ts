/**
 * The fields of the app's own follow-up screens (RAPP-720).
 *
 * Each follow-up (3a NIE, 3b Passaport, 3c Un altre, the "Altres" situation,
 * the specific needs details) holds field placements like any screen. Staff
 * edit, require, remove and add fields there with the same Questions list
 * every screen has.
 *
 * Some of the fields are the app's own and her phone keeps drawing them with
 * their own control: the document number with its NIE check, the document
 * name, the status details, the needs details. They are the follow-up's own
 * fields. Each follow-up starts with the ones it asked before (`OWN_FIELDS`,
 * in that order, with those flags); a screen that no longer holds one does not
 * draw it. Every other field placed there is drawn by the generic renderer,
 * after them.
 *
 * One field can sit on several sibling follow-ups (`SHARED_FOLLOW_UPS`): the
 * document follow-ups open on different answers of one question, so she sees
 * one of them only. "Número de document" is one field, one answer, on the NIE
 * and the passport screen; either screen can drop it and ask its own instead.
 *
 * The database keeps the same lists in `private.app_follow_ups()`.
 */
import { DETAIL_SCREEN_BRANCHES, type DetailScreen } from './screen-texts';
import type { SystemFieldKey } from './system-fields';

/** One of the app's own fields on a follow-up, as each follow-up starts. */
export interface FollowUpOwnField {
  readonly key: SystemFieldKey;
  /** Whether her phone required it before RAPP-720: the flag its placement starts with. */
  readonly required: boolean;
}

/** The app's own fields of each follow-up, in their order (RAPP-720). */
export const FOLLOW_UP_OWN_FIELDS: Readonly<Record<DetailScreen, readonly FollowUpOwnField[]>> = {
  'documentation-nie': [{ key: 'document_number', required: true }],
  'documentation-passport': [{ key: 'document_number', required: true }],
  'documentation-other': [
    { key: 'document_name', required: true },
    { key: 'document_number', required: true },
  ],
  'applicant-status-details': [{ key: 'applicant_status_details', required: false }],
  'specific-needs-details': [{ key: 'specific_needs_details', required: false }],
};

/**
 * The follow-ups one field may sit on together: they open on different
 * answers of one question, so she is asked it once.
 */
export const SHARED_FOLLOW_UPS: readonly DetailScreen[] = [
  'documentation-nie',
  'documentation-passport',
  'documentation-other',
];

export const FOLLOW_UP_SCREENS: readonly DetailScreen[] = DETAIL_SCREEN_BRANCHES.map(
  (branch) => branch.screen,
);

export function isFollowUpScreen(key: string | null | undefined): key is DetailScreen {
  return key != null && (FOLLOW_UP_SCREENS as readonly string[]).includes(key);
}

/** Whether a field placed on one screen may also sit on the other one. */
export function canShareField(placedOn: string | null, other: string | null): boolean {
  const shared = SHARED_FOLLOW_UPS as readonly (string | null)[];
  return placedOn !== other && shared.includes(placedOn) && shared.includes(other);
}

/** The follow-ups whose own control draws an app field; none for every other field. */
export function followUpsOfOwnField(key: string | null | undefined): readonly DetailScreen[] {
  return FOLLOW_UP_SCREENS.filter((screen) =>
    FOLLOW_UP_OWN_FIELDS[screen].some((field) => field.key === key),
  );
}

/**
 * How a follow-up asks one of its own fields: `required`, `optional`, or not
 * at all (staff took it off the screen).
 */
export type OwnFieldAsking = 'required' | 'optional' | 'not_asked';

/** What each follow-up asks of its own fields, by system key. */
export type FollowUpAsking = Readonly<
  Record<DetailScreen, Readonly<Partial<Record<SystemFieldKey, OwnFieldAsking>>>>
>;

/** Each follow-up as it starts, and as an older catalog with no layout reads it. */
export const DEFAULT_FOLLOW_UP_ASKING: FollowUpAsking = Object.fromEntries(
  FOLLOW_UP_SCREENS.map((screen) => [
    screen,
    Object.fromEntries(
      FOLLOW_UP_OWN_FIELDS[screen].map((field) => [
        field.key,
        field.required ? 'required' : 'optional',
      ]),
    ),
  ]),
) as FollowUpAsking;

/** How a follow-up asks one of its own fields; not at all when it is not one of them. */
export function ownFieldAsking(
  asking: FollowUpAsking,
  screen: DetailScreen,
  key: SystemFieldKey,
): OwnFieldAsking {
  return asking[screen][key] ?? 'not_asked';
}

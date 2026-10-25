/**
 * The staff participant detail: the pure readings the screen makes of her
 * record and her timeline (RAPP-24). Her record itself is `ParticipantRecord`
 * (`participant-detail-actions.ts`): her account and her answers by field.
 */

/**
 * Whether she joined, read the way `update_participant_profile` reads it: only
 * an invited woman is completed in parts. A joined player may never have
 * accepted the terms (records from before them), so `terms_accepted_at` cannot
 * say it (RAPP-653).
 */
export function hasJoined(participant: { readonly role: string }): boolean {
  return participant.role !== 'invited';
}

/**
 * Every source of participant activity the product will have. Named here, once,
 * so the tabs on this screen and the branches later phases add to
 * `public.participant_activity()` cannot drift into two vocabularies: a tab with
 * no matching branch is an empty section nobody can explain, and a branch with
 * no matching tab is data the screen silently drops.
 *
 * Order is the order the tabs appear in, which is roughly how often the team
 * asks: attendance first, equipment last.
 */
export const PARTICIPANT_ACTIVITY_KINDS = [
  'attendance',
  'event_signup',
  'message',
  'forum_post',
  'feedback',
  'equipment',
  'service_interest',
  'referral_update',
] as const;

export type ParticipantActivityKind = (typeof PARTICIPANT_ACTIVITY_KINDS)[number];

/** The one row shape every activity source resolves to. */
export interface ParticipantActivityEntry {
  readonly id: string;
  readonly kind: ParticipantActivityKind;
  readonly occurred_at: string;
  readonly title: string;
  readonly detail: string | null;
}

/** The tab a staff member has selected: one source, or the whole timeline. */
export type ParticipantActivityFilter = ParticipantActivityKind | 'all';

/**
 * `all` is every entry rather than a seventh kind, which sounds obvious and is
 * exactly the bug that makes a timeline open empty on its default tab.
 */
export function filterParticipantActivity(
  entries: readonly ParticipantActivityEntry[],
  filter: ParticipantActivityFilter,
): readonly ParticipantActivityEntry[] {
  return filter === 'all' ? entries : entries.filter((entry) => entry.kind === filter);
}

const ACTIVITY_DETAIL_KEYS: Partial<Record<ParticipantActivityKind, Record<string, string>>> = {
  attendance: {
    present: 'attendance:statusPresent',
    absent: 'attendance:statusAbsent',
    excused: 'attendance:statusExcused',
  },
  event_signup: {
    interested: 'participants:activity.signup.interested',
    confirmed: 'participants:activity.signup.confirmed',
    cancelled: 'participants:activity.signup.cancelled',
  },
};

/**
 * The translation key for an entry whose detail is a stored status code
 * (attendance and sign-ups, RAPP-283), or null when the detail is already text
 * to show as it is. An unknown code is shown as it is, so it is never hidden.
 */
export function activityDetailKey(
  entry: Pick<ParticipantActivityEntry, 'kind' | 'detail'>,
): string | null {
  if (entry.detail === null) return null;
  return ACTIVITY_DETAIL_KEYS[entry.kind]?.[entry.detail] ?? null;
}

/** A staff note as the thread renders it, with the author it is signed by. */
export interface ParticipantNoteRow {
  readonly id: string;
  readonly body: string;
  readonly created_at: string;
  readonly author_id: string;
  readonly author: { readonly first_name: string; readonly last_name: string } | null;
}

/**
 * The name a note is signed with, or nothing.
 *
 * An author row the caller cannot read comes back from the embed as null, and
 * the honest answer is the ABSENCE of a name: the screen then says "unknown" in
 * the reader's own language, instead of this module inventing an untranslated
 * placeholder or, worse, rendering "null null" over a colleague's signature.
 */
export function noteAuthorName(note: Pick<ParticipantNoteRow, 'author'>): string | null {
  return note.author === null ? null : `${note.author.first_name} ${note.author.last_name}`;
}

/**
 * The note columns, with the author embedded through the FK by NAME.
 *
 * The constraint name is not decoration. `participant_notes` points at
 * `profiles` twice (the subject and the author), so an unqualified embed is
 * ambiguous and PostgREST refuses it rather than guessing; naming the
 * constraint is what says "the author, not the participant".
 */
export const PARTICIPANT_NOTE_COLUMNS =
  'id, body, created_at, author_id, author:profiles!participant_notes_author_id_fkey(first_name, last_name)';

/**
 * The staff participant detail: the shapes the screen reads, and the pure
 * readings it makes of them (RAPP-24).
 *
 * The row shape EXTENDS the player-side `ProfileRow` rather than restating it,
 * which is what lets the admin edit form reuse `profileFromRow` and
 * `buildUpdateOwnProfilePayload` untouched. That reuse is the point of the
 * issue: the same woman's NIE has to be judged by the same rule whether she
 * typed it during onboarding, corrected it in her own profile, or had a staff
 * member fix it for her. Three declarations would be three slowly diverging
 * meanings of "valid", and the one that drifts is always the one nobody re-read.
 */

import type { ProfileRow } from '../schemas/profile';

/**
 * A participant as staff see her: everything her own profile screen shows, plus
 * the fields that are the team's business and not hers to set.
 */
export interface ParticipantDetailRow extends ProfileRow {
  readonly is_active: boolean;
  readonly is_forum_banned: boolean;
  readonly created_at: string;
  readonly updated_at: string;
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

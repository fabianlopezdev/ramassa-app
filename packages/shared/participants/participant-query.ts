/**
 * The participants query (RAPP-23): the URL's search params in, a Supabase
 * query out.
 *
 * Two rules shape this file.
 *
 * The URL is USER INPUT. Everything the table reads from it goes through the
 * schema first, and the sort column especially: it is interpolated into an
 * `order()` call, so it is an enum of columns this screen is willing to sort
 * by, never a free string. The encrypted columns are not among them, which is
 * the same boundary the search document draws.
 *
 * Paging and sorting happen in the DATABASE. Fetching an organization and
 * slicing it in the browser works fine on the twenty seeded participants and
 * falls over at two hundred, which is the size this roster is meant to reach.
 */

import { z } from 'zod';

export const PARTICIPANT_PAGE_SIZE = 25;

/**
 * The columns the table may sort by: what it displays, minus anything
 * encrypted. Sorting by ciphertext would order rows by their encryption, which
 * is meaningless, and offering it would imply the column is readable in bulk.
 */
export const PARTICIPANT_SORT_COLUMNS = [
  'last_name',
  'first_name',
  'city',
  'nationality',
  'reference_entity',
  'created_at',
] as const;
export type ParticipantSortColumn = (typeof PARTICIPANT_SORT_COLUMNS)[number];

/**
 * Every field falls back rather than throwing. A staff member who hand-edits a
 * URL, or follows a stale bookmark from before a filter was renamed, should get
 * the table she expected with that one filter ignored, not an error page.
 */
/**
 * A URL is strings all the way down: an absent filter comes back from the
 * address bar as the four characters "null", not as null. Read literally that
 * filters the roster to an entity by that name and the table shows nobody,
 * which reads as "search is broken" and is actually a round trip. An entity
 * genuinely called "Nullestrand" is unaffected: only the exact placeholders
 * are treated as absence.
 */
const absentAsNull = (value: unknown): unknown =>
  value === '' || value === 'null' || value === 'undefined' || value === undefined ? null : value;

export const participantSearchSchema = z.object({
  q: z.string().trim().max(200).catch('').default(''),
  entity: z
    .preprocess(absentAsNull, z.string().trim().max(200).nullable())
    .catch(null)
    .default(null),
  nationality: z
    .preprocess(absentAsNull, z.string().trim().max(100).nullable())
    .catch(null)
    .default(null),
  // `invited`: women whose profile staff created and who have not joined yet (RAPP-300).
  status: z.enum(['all', 'active', 'inactive', 'invited']).catch('all').default('all'),
  dependents: z.enum(['all', 'with', 'without']).catch('all').default('all'),
  sort: z.enum(PARTICIPANT_SORT_COLUMNS).catch('last_name').default('last_name'),
  dir: z.enum(['asc', 'desc']).catch('asc').default('asc'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type ParticipantSearch = z.infer<typeof participantSearchSchema>;

export function parseParticipantSearch(search: Record<string, unknown>): ParticipantSearch {
  return participantSearchSchema.parse(search);
}

/**
 * Turns what a staff member has typed so far into a PREFIX tsquery.
 *
 * Search fires on every pause in typing, so the term is usually half a word.
 * Whole-token matching means "yo" finds nobody while Yolanda is visible in the
 * list on screen, which is indistinguishable from a broken search box; `:*`
 * makes each word match from its start.
 *
 * Everything that is not a letter, a digit or a space is REMOVED first. The
 * result is interpolated into `to_tsquery`, whose operators (`&`, `|`, `!`,
 * `(`, `:`, `*`, `<->`) are the injection surface: left in, a stray `!` is a
 * syntax error the staff member sees as a crash, and a crafted string is a
 * different query than the one she asked for. Letters are matched by Unicode
 * class, so Arabic, Farsi and Cyrillic pass through untouched.
 *
 * Accents are deliberately KEPT: the search document indexes both the accented
 * and the folded spelling, so "Torelló" and "torello" both match without this
 * layer having to own a copy of Postgres's unaccent dictionary.
 */
export function buildPrefixTsQuery(term: string): string {
  return term
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => `${word}:*`)
    .join(' & ');
}

/**
 * One roster row, as `list_participants` returns it. The Personal fields
 * (nationality, city, dependants) are null for a caller without
 * participants.view_personal (RAPP-240).
 */
export interface ParticipantListRow {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly nationality: string | null;
  readonly city: string | null;
  readonly reference_entity: string | null;
  readonly has_dependents: boolean | null;
  readonly num_dependents: number | null;
  readonly is_active: boolean;
  readonly preferred_language: string;
  readonly created_at: string;
  /** False for an invited woman who has not accepted the terms yet (RAPP-300). */
  readonly joined: boolean;
  /** A made-up player for designing the onboarding (RAPP-615). */
  readonly is_test_account: boolean;
}

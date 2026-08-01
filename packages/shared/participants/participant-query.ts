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
  status: z.enum(['all', 'active', 'inactive']).catch('all').default('all'),
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
 * The subset of the Supabase query builder this needs. Declared structurally so
 * the tests can hand it a recorder and see the question that was actually
 * asked, rather than mocking a client and hoping.
 */
export interface ParticipantQueryBuilder {
  eq(column: string, value: unknown): ParticipantQueryBuilder;
  textSearch(
    column: string,
    query: string,
    options: { type: 'websearch'; config: string },
  ): ParticipantQueryBuilder;
  order(column: string, options: { ascending: boolean }): ParticipantQueryBuilder;
  range(from: number, to: number): ParticipantQueryBuilder;
}

export function applyParticipantQuery<T extends ParticipantQueryBuilder>(
  builder: T,
  search: ParticipantSearch,
): T {
  // Participants only. Staff, admins and entity contacts share the table but
  // are not roster rows, and RLS already limits everything to one organization.
  let query = builder.eq('role', 'player') as T;

  if (search.q !== '') {
    // The generated document, not a LIKE across columns: the index exists, and
    // an unanchored LIKE would scan the whole organization for every keystroke.
    // 'simple' matches how the document was built, accents already folded.
    query = query.textSearch('search_document', search.q, {
      type: 'websearch',
      config: 'simple',
    }) as T;
  }

  if (search.entity !== null) {
    query = query.eq('reference_entity', search.entity) as T;
  }
  if (search.nationality !== null) {
    query = query.eq('nationality', search.nationality) as T;
  }
  // "all" adds no predicate at all. A predicate that matches everything still
  // costs the planner something and, worse, reads in the logs as a filter the
  // user set.
  if (search.status !== 'all') {
    query = query.eq('is_active', search.status === 'active') as T;
  }
  if (search.dependents !== 'all') {
    query = query.eq('has_dependents', search.dependents === 'with') as T;
  }

  query = query.order(search.sort, { ascending: search.dir === 'asc' }) as T;
  // A tiebreaker, always. Two people from the same town under a non-unique sort
  // can otherwise swap places between page requests, which shows one of them
  // twice and the other never.
  query = query.order('id', { ascending: true }) as T;

  const from = (search.page - 1) * PARTICIPANT_PAGE_SIZE;
  return query.range(from, from + PARTICIPANT_PAGE_SIZE - 1) as T;
}

/** The columns the table reads. No encrypted column is among them. */
export const PARTICIPANT_LIST_COLUMNS =
  'id, first_name, last_name, nationality, city, reference_entity, has_dependents, num_dependents, is_active, preferred_language, created_at';

export interface ParticipantListRow {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly nationality: string | null;
  readonly city: string | null;
  readonly reference_entity: string | null;
  readonly has_dependents: boolean;
  readonly num_dependents: number;
  readonly is_active: boolean;
  readonly preferred_language: string;
  readonly created_at: string;
}

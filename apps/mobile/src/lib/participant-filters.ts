/** The participant list's filter rules (RAPP-280), apart from React so they are tested on their own. */
import type { ParticipantSearch } from '@ramassa/shared/participants';

export type ParticipantListSearch = Omit<ParticipantSearch, 'page'>;

/** How many of the sheet's filters are set (status has its own chips). */
export function activeSheetFilters(search: ParticipantListSearch): number {
  return [search.entity !== null, search.nationality !== null, search.dependents !== 'all'].filter(
    Boolean,
  ).length;
}

/** Tapping the column already sorted flips the direction; another column sorts up. */
export function nextSort(
  search: ParticipantListSearch,
  column: ParticipantListSearch['sort'],
): Pick<ParticipantListSearch, 'sort' | 'dir'> {
  if (search.sort === column) return { sort: column, dir: search.dir === 'asc' ? 'desc' : 'asc' };
  return { sort: column, dir: 'asc' };
}

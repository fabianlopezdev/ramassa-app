/**
 * The participants table (RAPP-23).
 *
 * Every control writes to the URL and nothing else. There is no local copy of
 * "which filters are on", so the address bar and the table cannot disagree, and
 * a filtered view is a link a staff member can send to a colleague.
 *
 * The one exception is the search box, which keeps the keystrokes it has not
 * committed yet: typing must not wait for a round trip, and the URL must not
 * gain a history entry per letter. It commits on a pause (see `SEARCH_DEBOUNCE_MS`).
 */

import { ParticipantsFilters } from '@/components/participants/participants-filters';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  PARTICIPANT_PAGE_SIZE,
  type ParticipantFilterOptions,
  type ParticipantListRow,
  type ParticipantPage,
  type ParticipantSearch,
  type ParticipantSortColumn,
} from '@ramassa/shared/participants';

export interface ParticipantsTableProps {
  readonly page: ParticipantPage;
  readonly filterOptions: ParticipantFilterOptions;
  readonly search: ParticipantSearch;
}

const COLUMNS: readonly { key: ParticipantSortColumn; labelKey: string }[] = [
  { key: 'last_name', labelKey: 'columnName' },
  { key: 'nationality', labelKey: 'columnNationality' },
  { key: 'city', labelKey: 'columnCity' },
  { key: 'reference_entity', labelKey: 'columnEntity' },
  { key: 'created_at', labelKey: 'columnJoined' },
];

export function ParticipantsTable({ page, filterOptions, search }: ParticipantsTableProps) {
  const { t, i18n } = useTranslation('participants');
  const navigate = useNavigate({ from: '/participants' });

  const pages = Math.max(1, Math.ceil(page.total / PARTICIPANT_PAGE_SIZE));

  /**
   * Any change to a filter or the sort returns to page 1. Staying on page 7
   * after narrowing to three results shows an empty table and reads as "no
   * matches", which is the single most common way a filtered table lies.
   */
  function applySearch(next: Partial<ParticipantSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...next }) });
  }

  function toggleSort(column: ParticipantSortColumn) {
    applySearch({
      sort: column,
      dir: search.sort === column && search.dir === 'asc' ? 'desc' : 'asc',
    });
  }

  return (
    <section className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('summary', { count: page.total })}</p>
      </header>

      <ParticipantsFilters search={search} filterOptions={filterOptions} onChange={applySearch} />

      {page.rows.length === 0 ? (
        // An empty state that says what to DO. "No results" alone leaves a
        // staff member wondering whether the roster is empty or her filters are
        // wrong, and those need different reactions.
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-8">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
          <Button
            variant="outline"
            onClick={() =>
              void navigate({
                search: () => ({
                  q: '',
                  entity: null,
                  nationality: null,
                  status: 'all' as const,
                  dependents: 'all' as const,
                  sort: search.sort,
                  dir: search.dir,
                  page: 1,
                }),
              })
            }
          >
            {t('clearFilters')}
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column.key}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    aria-label={t('sortBy', { column: t(column.labelKey) })}
                    // The sorted column is announced, not just painted: an
                    // arrow glyph tells a screen-reader user nothing.
                    aria-sort={
                      search.sort === column.key
                        ? search.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className="flex items-center gap-1 font-medium hover:text-foreground"
                  >
                    {t(column.labelKey)}
                    {search.sort === column.key ? <SortGlyph direction={search.dir} /> : null}
                  </button>
                </TableHead>
              ))}
              <TableHead>{t('columnDependents')}</TableHead>
              <TableHead>{t('columnStatus')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.map((row) => (
              <ParticipantRow key={row.id} row={row} locale={i18n.resolvedLanguage ?? 'ca'} />
            ))}
          </TableBody>
        </Table>
      )}

      <footer className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{t('pageOf', { page: search.page, pages })}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={search.page <= 1}
            onClick={() => void navigate({ search: (prev) => ({ ...prev, page: prev.page - 1 }) })}
          >
            {t('previousPage')}
          </Button>
          <Button
            variant="outline"
            disabled={search.page >= pages}
            onClick={() => void navigate({ search: (prev) => ({ ...prev, page: prev.page + 1 }) })}
          >
            {t('nextPage')}
          </Button>
        </div>
      </footer>
    </section>
  );
}

function SortGlyph({ direction }: { direction: 'asc' | 'desc' }) {
  return (
    <span aria-hidden className="text-xs">
      {direction === 'asc' ? '▲' : '▼'}
    </span>
  );
}

function ParticipantRow({ row, locale }: { row: ParticipantListRow; locale: string }) {
  const { t } = useTranslation('participants');
  const none = t('rowNone');
  return (
    <TableRow>
      <TableCell className="font-medium">{`${row.first_name} ${row.last_name}`}</TableCell>
      <TableCell>{row.nationality ?? none}</TableCell>
      <TableCell>{row.city ?? none}</TableCell>
      <TableCell>{row.reference_entity ?? none}</TableCell>
      <TableCell>{new Date(row.created_at).toLocaleDateString(locale)}</TableCell>
      <TableCell>{row.has_dependents ? row.num_dependents : none}</TableCell>
      <TableCell>{row.is_active ? t('rowActive') : t('rowInactive')}</TableCell>
    </TableRow>
  );
}

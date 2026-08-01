/**
 * The admin's ONE data table (RAPP-23).
 *
 * Built to be shared, not to serve the participants roster: announcements
 * (RAPP-30), events (RAPP-31), the knowledge base (RAPP-32) and the attendance
 * reports (RAPP-39) are all lists of rows with sorting and paging, and four
 * hand-rolled tables would be four different behaviours for the same gesture.
 * A screen supplies COLUMN DEFINITIONS and its current state; everything about
 * how a table looks, sorts, announces itself and pages lives here.
 *
 * SERVER-DRIVEN by design. `manualSorting` and `manualPagination` tell TanStack
 * Table that the rows it was handed are already the right page in the right
 * order: this app sorts and pages in Postgres, because slicing an organization
 * in the browser works at twenty participants and fails at two hundred. What
 * the library gives us here is the column contract, the header/cell rendering
 * and the sorting state machine, all of which every future table needs.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface DataTableProps<TRow> {
  readonly columns: ColumnDef<TRow, unknown>[];
  readonly rows: readonly TRow[];
  /** The sort the SERVER applied, mirrored so the header can show it. */
  readonly sorting: SortingState;
  readonly onSortingChange: (next: SortingState) => void;
  /** Shown instead of the table when there are no rows: never a blank frame. */
  readonly empty: ReactNode;
}

export function DataTable<TRow>({
  columns,
  rows,
  sorting,
  onSortingChange,
  empty,
}: DataTableProps<TRow>) {
  // `common`, never a screen's own catalogue: a shared table that reads its
  // labels from `participants` is only shared by accident.
  const { t } = useTranslation('common');

  const table = useReactTable({
    data: rows as TRow[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { sorting },
    onSortingChange: (updater) => {
      onSortingChange(typeof updater === 'function' ? updater(sorting) : updater);
    },
  });

  if (rows.length === 0) {
    return <>{empty}</>;
  }

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const sortDirection = header.column.getIsSorted();
              const label = flexRender(header.column.columnDef.header, header.getContext());
              return (
                <TableHead
                  key={header.id}
                  // Announced, not just painted: an arrow glyph tells a screen
                  // reader nothing, and this is the control staff use most.
                  aria-sort={
                    sortDirection === false
                      ? 'none'
                      : sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                  }
                >
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      aria-label={t('table.sortBy', {
                        column: String(header.column.columnDef.header),
                      })}
                      className="flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      {label}
                      {sortDirection === false ? null : (
                        <span aria-hidden className="text-xs">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </button>
                  ) : (
                    label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

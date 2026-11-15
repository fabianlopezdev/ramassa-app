/**
 * One section of a catalogue page (RAPP-650, RAPP-699): a card with its title
 * and actions, column labels over its rows, and a line when it has none.
 * Dades de les jugadores' sections and Dades legals' three sections draw with
 * it, so both pages read the same way.
 */

import { EditorSection } from '@/components/layout/editor-section';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function CatalogSection({
  title,
  label,
  actions,
  rows,
  emptyLabel,
  columnName,
  columnBadge,
  testId,
}: {
  readonly title: ReactNode;
  /** The list's accessible name. */
  readonly label: string;
  readonly actions?: ReactNode;
  readonly rows: readonly { readonly id: string; readonly row: ReactNode }[];
  readonly emptyLabel: string;
  /** The first column's label. */
  readonly columnName: string;
  /** The badge column's label: the privacy of a field; empty when the rows have none. */
  readonly columnBadge: string;
  readonly testId: string;
}) {
  const { t } = useTranslation('settings');
  return (
    <EditorSection isFlush testId={testId} title={title} actions={actions}>
      {rows.length === 0 ? null : (
        <div
          aria-hidden
          className="flex h-9 items-center gap-3 border-b bg-muted/40 px-5 text-start text-xs font-medium text-muted-foreground"
        >
          <span className="min-w-0 flex-1 truncate">{columnName}</span>
          <span className="w-20 shrink-0 truncate">{columnBadge}</span>
          <span className="hidden w-56 shrink-0 truncate md:block">
            {t('profileLayout.columnAskedIn')}
          </span>
          <span className="w-36 shrink-0" />
        </div>
      )}
      <ol className="flex flex-col divide-y" aria-label={label}>
        {rows.map(({ id, row }) => (
          <li key={id} className="bg-card">
            {row}
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="flex h-16 items-center px-5 text-start text-sm text-muted-foreground">
            {emptyLabel}
          </li>
        ) : null}
      </ol>
    </EditorSection>
  );
}

/**
 * The pager every admin list shares (RAPP-23).
 *
 * Lives beside the table rather than inside it because a screen may page a
 * list it renders as cards rather than rows; what must not vary is the wording,
 * the disabled edges and where the control sits.
 */

import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export interface DataTablePagerProps {
  readonly page: number;
  readonly pages: number;
  readonly onPageChange: (page: number) => void;
}

export function DataTablePager({ page, pages, onPageChange }: DataTablePagerProps) {
  const { t } = useTranslation('common');
  return (
    <footer className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">{t('table.pageOf', { page, pages })}</p>
      <div className="flex gap-2">
        {/* Disabled at the edges rather than hidden: a control that vanishes
            makes the row jump, and a staff member loses the button she was
            aiming at. */}
        <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          {t('table.previousPage')}
        </Button>
        <Button variant="outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          {t('table.nextPage')}
        </Button>
      </div>
    </footer>
  );
}

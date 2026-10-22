/**
 * The Generalitat funding credit (RAPP-64): a grant obligation, so it is on
 * every page and cannot be removed. Since RAPP-632 it is a quiet line at the
 * foot of the main content in the staff and entity areas, instead of the
 * bottom of the sidebar.
 */
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function FundingFooter({ className }: { readonly className?: string }) {
  const { t } = useTranslation('common');
  return (
    <footer
      className={cn('mt-auto border-t border-border/70 px-4 py-4 sm:px-6', className)}
      data-testid="funding-footer"
    >
      <p className="text-xs leading-5 text-muted-foreground" data-testid="generalitat-credit">
        {t('fundingAcknowledgment')}
      </p>
    </footer>
  );
}

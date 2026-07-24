import { useTranslation } from 'react-i18next';

/**
 * The pre-content empty state a not-yet-built admin or entity section renders
 * (RAPP-16). The nav shells ship with every destination reachable before the
 * features land, so guards, active state, and RTL can be verified now.
 *
 * Renders a `section`, never a `main`: the staff area's `SidebarInset` and the
 * entity layout each already provide the page's single `main` landmark, and
 * nesting a second one is an accessibility violation.
 */
export function AdminPlaceholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation('nav');
  return (
    <section className="p-6">
      <h1 className="text-lg font-semibold text-foreground">{t(titleKey)}</h1>
    </section>
  );
}

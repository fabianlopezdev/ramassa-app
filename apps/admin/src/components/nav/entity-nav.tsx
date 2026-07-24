import { ENTITY_NAV_ITEMS } from '@/lib/nav-items';
import { cn } from '@/lib/utils';
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/**
 * The entity portal navigation shell (RAPP-16).
 *
 * Deliberately *reduced* compared to the staff sidebar: a partner org visits
 * occasionally to refer someone or submit a service, so a single horizontal bar
 * of four destinations suits that far better than a collapsible six-section CMS
 * sidebar, and the lighter chrome makes the two areas visually distinct at a
 * glance. Icon + translated label on every item (SPEC UX rule), `aria-current`
 * on the active one. Entity users only: the `_entity` layout guards the area
 * deny-by-default (RAPP-13). The item map lives in `lib/nav-items`, namespaced
 * under /portal so it can never collide with a staff route.
 */
export function EntityNav() {
  const { t } = useTranslation(['nav', 'common']);
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <header className="border-b border-border bg-background">
      <div className="flex h-14 items-center gap-6 px-4">
        <Link to="/portal" className="text-base font-semibold text-foreground">
          {t('common:appName')}
        </Link>
        <nav aria-label={t('nav:a11y.entityPortal')}>
          <ul className="flex items-center gap-1">
            {ENTITY_NAV_ITEMS.map((item) => {
              const label = t(item.labelKey);
              const isActive = pathname === item.to;
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                      'outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      isActive
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

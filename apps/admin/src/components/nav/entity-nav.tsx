import { OrganizationBrand } from '@/components/branding/organization-brand';
import { LanguageMenu } from '@/components/nav/language-menu';
import { UserMenu } from '@/components/nav/user-menu';
import { Badge } from '@/components/ui/badge';
import { useUnreadMessageCount } from '@/lib/messaging';
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
export interface EntityNavProps {
  /** The layout passes the app's `logout`, so this file stays free of the client. */
  readonly onSignOut: () => Promise<unknown>;
}

export function EntityNav({ onSignOut }: EntityNavProps) {
  const { t } = useTranslation(['nav', 'common', 'admin']);
  const pathname = useLocation({ select: (location) => location.pathname });
  const unread = useUnreadMessageCount();

  return (
    // The portal bar wears the brand like the staff sidebar (RAPP-631): the
    // primary colour, white text, a yellow marker under the current page.
    <header className="sticky top-0 z-10 bg-primary text-primary-foreground shadow-md">
      <div className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <Link
          to="/portal"
          className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-secondary"
        >
          <OrganizationBrand subtitle={t('admin:entityPortalSubtitle')} />
        </Link>
        <nav aria-label={t('nav:a11y.entityPortal')}>
          <ul className="flex items-center gap-1">
            {ENTITY_NAV_ITEMS.map((item) => {
              const label = t(item.labelKey);
              const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                      'outline-none focus-visible:ring-3 focus-visible:ring-secondary',
                      'after:absolute after:inset-x-3 after:-bottom-1 after:h-1 after:rounded-full after:bg-secondary after:opacity-0',
                      isActive
                        ? 'bg-white/15 font-semibold text-primary-foreground after:opacity-100 [&>svg]:text-secondary'
                        : 'text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span>{label}</span>
                    {item.to === '/portal/messages' && unread > 0 ? (
                      <Badge
                        variant="secondary"
                        data-testid="entity-message-badge"
                        aria-label={t('messaging:unread', { count: unread })}
                      >
                        {Math.min(unread, 99)}
                      </Badge>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {/* The language and her user menu, as in the staff top bar (RAPP-632). */}
        <div className="ms-auto flex items-center gap-1">
          <LanguageMenu tone="brand" />
          <UserMenu onSignOut={onSignOut} tone="brand" />
        </div>
      </div>
    </header>
  );
}

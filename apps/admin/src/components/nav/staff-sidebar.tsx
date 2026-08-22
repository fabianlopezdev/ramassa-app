import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useUnreadMessageCount } from '@/lib/messaging';
import { STAFF_NAV_ITEMS } from '@/lib/nav-items';
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import type { LayoutDirection } from '@ramassa/shared/i18n';

export function sidebarSideForDirection(direction: LayoutDirection): 'left' | 'right' {
  return direction === 'rtl' ? 'right' : 'left';
}

/**
 * The staff CMS navigation shell (RAPP-16): the six-section sidebar every staff
 * feature mounts beside, collapsible to an icon rail (SPEC: desktop, data-dense).
 * Each item pairs a lucide icon with a translated label (SPEC UX rule: never
 * icon-only) and marks the active route with `aria-current` for both screen
 * readers and the visual active state. Reachable only by staff/admin: the
 * `_staff` layout guards the whole area deny-by-default (RAPP-13). The item map
 * itself lives in `lib/nav-items` so its destinations stay directly testable.
 */
export function StaffSidebar() {
  const { t, i18n } = useTranslation(['nav', 'common']);
  const pathname = useLocation({ select: (location) => location.pathname });
  const unread = useUnreadMessageCount();
  const { role } = useAuth();
  const visibleItems = STAFF_NAV_ITEMS.filter(
    (item) => !('adminOnly' in item) || !item.adminOnly || role === 'admin',
  );

  return (
    <Sidebar collapsible="icon" side={sidebarSideForDirection(i18n.dir())}>
      <SidebarHeader className="px-3 py-4">
        <span className="text-base font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          {t('common:appName')}
        </span>
      </SidebarHeader>
      <SidebarContent>
        {/* role + aria-label makes this a named navigation landmark. */}
        <SidebarGroup role="navigation" aria-label={t('nav:a11y.staffSidebar')}>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const label = t(item.labelKey);
                const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                      <Link to={item.to} aria-current={isActive ? 'page' : undefined}>
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
                        {item.to === '/messages' && unread > 0 ? (
                          <Badge
                            data-testid="staff-message-badge"
                            aria-label={t('messaging:unread', { count: unread })}
                          >
                            {Math.min(unread, 99)}
                          </Badge>
                        ) : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

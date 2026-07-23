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
import { STAFF_NAV_ITEMS } from '@/lib/nav-items';
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation(['nav', 'common']);
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <Sidebar collapsible="icon">
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
              {STAFF_NAV_ITEMS.map((item) => {
                const label = t(item.labelKey);
                const isActive = pathname === item.to;
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                      <Link to={item.to} aria-current={isActive ? 'page' : undefined}>
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
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

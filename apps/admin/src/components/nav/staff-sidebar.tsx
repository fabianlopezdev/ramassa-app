import { OrganizationBrand } from '@/components/branding/organization-brand';
import { PreviewAsPlayer } from '@/components/content/preview-as-player';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useUnreadMessageCount } from '@/lib/messaging';
import { visibleStaffNavItems } from '@/lib/nav-items';
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import type { LayoutDirection } from '@ramassa/shared/i18n';

/**
 * A menu row on the navy sidebar (RAPP-631): white text, a lighter row on
 * hover, and for the current page a yellow marker at the start edge with a
 * yellow icon. Yellow only ever sits on the navy, never on white.
 */
const NAV_BUTTON_CLASS =
  'relative h-9 before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-sidebar-primary before:opacity-0 data-active:font-semibold data-active:before:opacity-100 data-active:[&>svg]:text-sidebar-primary group-data-[collapsible=icon]:before:inset-y-1.5';

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
  const { t, i18n } = useTranslation(['nav', 'common', 'admin']);
  const pathname = useLocation({ select: (location) => location.pathname });
  const unread = useUnreadMessageCount();
  const { permissions } = useAuth();
  const visibleItems = visibleStaffNavItems(permissions);

  return (
    <Sidebar collapsible="icon" side={sidebarSideForDirection(i18n.dir())}>
      {/* One brand block (RAPP-631): logo tile and name side by side, the
        tile alone in the collapsed icon rail. */}
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4 group-data-[collapsible=icon]:px-2">
        <OrganizationBrand
          subtitle={t('admin:loginTitle')}
          className="group-data-[collapsible=icon]:justify-center"
          tileClassName="group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-lg"
          textClassName="group-data-[collapsible=icon]:hidden"
        />
      </SidebarHeader>
      <SidebarContent className="pt-2">
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
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={label}
                      className={NAV_BUTTON_CLASS}
                    >
                      <Link to={item.to} aria-current={isActive ? 'page' : undefined}>
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
                        {item.to === '/messages' && unread > 0 ? (
                          <Badge
                            variant="secondary"
                            className="ms-auto"
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
      {/* Sign out and the language moved to the top bar, and the funding credit
        to the foot of every page (RAPP-632). */}
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:hidden">
        {/* Every team member, with no permission needed (ADR-026, RAPP-372). */}
        <PreviewAsPlayer
          target={null}
          variant="ghost"
          buttonClassName="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

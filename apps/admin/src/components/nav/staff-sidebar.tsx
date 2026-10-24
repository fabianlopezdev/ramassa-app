import { OrganizationBrand } from '@/components/branding/organization-brand';
import { PreviewAsPlayer } from '@/components/content/preview-as-player';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useUnreadMessageCount } from '@/lib/messaging';
import { activeStaffNavPath, visibleStaffNavGroups, type StaffNavGroup } from '@/lib/nav-items';
import { Link, useLocation } from '@tanstack/react-router';
import { useId } from 'react';
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
 * The staff CMS navigation shell (RAPP-16): the sidebar every staff feature
 * mounts beside, collapsible to an icon rail (SPEC: desktop, data-dense). Its
 * items group by audience (RAPP-654): Tauler and Participants on top, then
 * App de les jugadores, Entitats and Organització, each under its label; a
 * group with nothing she may open is left out. In the icon rail the labels
 * fold away and every icon keeps its tooltip.
 *
 * Each item pairs a lucide icon with a translated label (SPEC UX rule: never
 * icon-only) and marks the active route with `aria-current` for both screen
 * readers and the visual active state. Reachable only by staff/admin: the
 * `_staff` layout guards the whole area deny-by-default (RAPP-13). The item map
 * itself lives in `lib/nav-items` so its destinations stay directly testable.
 */
export function StaffSidebar() {
  const { t, i18n } = useTranslation(['nav', 'common', 'admin']);
  const pathname = useLocation({ select: (location) => location.pathname });
  const { permissions } = useAuth();
  // Only for someone with the inbox, so the design role asks nothing.
  const unread = useUnreadMessageCount(permissions.has('messages.inbox'));
  const groups = visibleStaffNavGroups(permissions);
  const activePath = activeStaffNavPath(
    pathname,
    groups.flatMap((group) => group.items),
  );

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
        {/* One named navigation landmark around every group. */}
        <nav aria-label={t('nav:a11y.staffSidebar')} className="flex flex-col">
          {groups.map((group) => (
            <StaffNavGroupSection
              key={group.id}
              group={group}
              activePath={activePath}
              unread={unread}
            />
          ))}
        </nav>
      </SidebarContent>
      {/* Sign out moved to the top bar (RAPP-632). */}
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

function StaffNavGroupSection({
  group,
  activePath,
  unread,
}: {
  readonly group: StaffNavGroup;
  readonly activePath: string | null;
  readonly unread: number;
}) {
  const { t } = useTranslation(['nav', 'messaging']);
  const labelId = useId();
  const hasLabel = group.labelKey !== null;
  return (
    <SidebarGroup data-testid={`staff-nav-group-${group.id}`}>
      {hasLabel ? <SidebarGroupLabel id={labelId}>{t(group.labelKey)}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu aria-labelledby={hasLabel ? labelId : undefined}>
          {group.items.map((item) => {
            const label = t(item.labelKey);
            const isActive = item.to === activePath;
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={label}
                  className={NAV_BUTTON_CLASS}
                >
                  {/* The router would mark every link the path sits in (Participants
                    under /participants/referrals); exact matching leaves the
                    marking to the one item chosen above. */}
                  <Link
                    to={item.to}
                    activeOptions={{ exact: true, includeSearch: false }}
                    aria-current={isActive ? 'page' : undefined}
                  >
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
  );
}

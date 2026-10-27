import { OrganizationBrand } from '@/components/branding/organization-brand';
import { PreviewAsPlayer } from '@/components/content/preview-as-player';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  SidebarMenuSub,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { useUnreadMessageCount } from '@/lib/messaging';
import {
  activeStaffNavPath,
  STAFF_NAV_PARENTS,
  visibleStaffNavGroups,
  type StaffNavGroup,
  type StaffNavParentId,
} from '@/lib/nav-items';
import { Link, useLocation } from '@tanstack/react-router';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
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
  const { t } = useTranslation('nav');
  const { state, isMobile } = useSidebar();
  const isRail = state === 'collapsed' && !isMobile;
  const rows = rowsOf(group.items);
  // In the icon rail every page is one flat icon: folds and indents need labels.
  if (group.labelKey === null || isRail) {
    return (
      <SidebarGroup data-testid={`staff-nav-group-${group.id}`}>
        <SidebarGroupContent>
          <SidebarMenu>
            {group.items.map((item) => (
              <NavItemRow key={item.to} item={item} activePath={activePath} unread={unread} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }
  return (
    <SidebarGroup data-testid={`staff-nav-group-${group.id}`}>
      <SidebarGroupContent>
        <SidebarMenu>
          <NavFold
            foldKey={`group:${group.id}`}
            testId={group.id}
            label={t(group.labelKey)}
            icon={group.icon}
            holdsActive={group.items.some((item) => item.to === activePath)}
          >
            <NavRows rows={rows} activePath={activePath} unread={unread} />
          </NavFold>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** A group's rows under its fold: pages, and rows holding pages that fold again. */
function NavRows({
  rows,
  activePath,
  unread,
}: {
  readonly rows: readonly MenuRow[];
  readonly activePath: string | null;
  readonly unread: number;
}) {
  const { t } = useTranslation('nav');
  return (
    <>
      {rows.map((row) => {
        if (row.kind === 'item') {
          return (
            <NavItemRow key={row.item.to} item={row.item} activePath={activePath} unread={unread} />
          );
        }
        const parent = STAFF_NAV_PARENTS[row.parent];
        return (
          <NavFold
            key={row.parent}
            foldKey={`parent:${row.parent}`}
            testId={row.parent}
            label={t(parent.labelKey)}
            icon={parent.icon}
            holdsActive={row.items.some((item) => item.to === activePath)}
          >
            {row.items.map((item) => (
              <NavItemRow key={item.to} item={item} activePath={activePath} unread={unread} />
            ))}
          </NavFold>
        );
      })}
    </>
  );
}

/**
 * One fold of the menu (RAPP-702), shared by the groups and by a row that
 * holds pages: a row drawn like any page, with its icon and a chevron, that
 * opens and closes on a click anywhere on it; what it holds sits indented
 * under it.
 */
function NavFold({
  foldKey,
  testId,
  label,
  icon: Icon,
  holdsActive,
  children,
}: {
  readonly foldKey: string;
  readonly testId: string;
  readonly label: string;
  readonly icon: LucideIcon | null;
  readonly holdsActive: boolean;
  readonly children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useFoldState(foldKey, holdsActive);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild className="group/fold">
      <SidebarMenuItem data-testid={`staff-nav-fold-${testId}`}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={label} className={NAV_BUTTON_CLASS}>
            {Icon === null ? null : <Icon aria-hidden="true" />}
            <span>{label}</span>
            <ChevronRight
              aria-hidden="true"
              className="ms-auto transition-transform group-data-[state=open]/fold:rotate-90 rtl:rotate-180 rtl:group-data-[state=open]/fold:rotate-90"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="me-0 pe-0">{children}</SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

/** One page of the menu, the same row at every depth. */
function NavItemRow({
  item,
  activePath,
  unread,
}: {
  readonly item: GroupItem;
  readonly activePath: string | null;
  readonly unread: number;
}) {
  const { t } = useTranslation(['nav', 'messaging']);
  const label = t(item.labelKey);
  const isActive = item.to === activePath;
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label} className={NAV_BUTTON_CLASS}>
        {/* The router would mark every link the path sits in (Participants
          under /participants/referrals); exact matching leaves the marking
          to the one item chosen above. */}
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
}

const FOLD_STORAGE_KEY = 'ramassa.staff-nav.folded';

function readFolded(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(FOLD_STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

function writeFolded(keys: readonly string[]) {
  try {
    window.localStorage.setItem(FOLD_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // A blocked store only means the menu opens unfolded next time.
  }
}

/**
 * Whether a menu fold is open (RAPP-702): open by default, remembered per
 * browser, opened again when it holds the page she is on, and always open in
 * the icon rail, where the labels are gone and the icons are the only way in.
 */
function useFoldState(key: string, holdsActive: boolean): [boolean, (open: boolean) => void] {
  const { state, isMobile } = useSidebar();
  const [isFolded, setIsFolded] = useState(false);
  useEffect(() => setIsFolded(readFolded().includes(key)), [key]);
  useEffect(() => {
    if (holdsActive) setIsFolded(false);
  }, [holdsActive]);
  const isRail = state === 'collapsed' && !isMobile;
  const setOpen = (open: boolean) => {
    setIsFolded(!open);
    const others = readFolded().filter((each) => each !== key);
    writeFolded(open ? others : [...others, key]);
  };
  return [isRail || !isFolded, setOpen];
}

type GroupItem = StaffNavGroup['items'][number];

type MenuRow =
  | { readonly kind: 'item'; readonly item: GroupItem }
  | {
      readonly kind: 'parent';
      readonly parent: StaffNavParentId;
      readonly items: readonly GroupItem[];
    };

/** The group's rows: each item, or its parent row in the first item's place. */
function rowsOf(items: readonly GroupItem[]): readonly MenuRow[] {
  const rows: MenuRow[] = [];
  for (const item of items) {
    const parent = 'parent' in item ? item.parent : undefined;
    if (parent === undefined) {
      rows.push({ kind: 'item', item });
      continue;
    }
    if (rows.some((row) => row.kind === 'parent' && row.parent === parent)) continue;
    rows.push({
      kind: 'parent',
      parent,
      items: items.filter((each) => 'parent' in each && each.parent === parent),
    });
  }
  return rows;
}

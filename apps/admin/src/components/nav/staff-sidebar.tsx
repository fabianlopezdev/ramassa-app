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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { fetchSystemFormId } from '@/lib/custom-forms';
import { useUnreadMessageCount } from '@/lib/messaging';
import {
  activeStaffNavPath,
  CUSTOM_FORMS_PERMISSIONS,
  holdsAnyPermission,
  STAFF_NAV_PARENTS,
  visibleStaffNavGroups,
  type StaffNavGroup,
  type StaffNavParentId,
} from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Link, useLocation } from '@tanstack/react-router';
import { ChevronRight, Scale, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import type { LayoutDirection } from '@ramassa/shared/i18n';
import { fetchLegalFormEntries, textIn, type LegalFormEntry } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/**
 * A menu row on the navy sidebar (RAPP-631): white text, a lighter row on
 * hover, and for the current page a yellow marker at the start edge with a
 * yellow icon. Yellow only ever sits on the navy, never on white. A long name
 * wraps to a second line, with no ellipsis (RAPP-702).
 */
const NAV_BUTTON_CLASS =
  'relative h-auto min-h-9 leading-snug [&>span:last-child]:text-clip before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-sidebar-primary before:opacity-0 data-active:font-semibold data-active:before:opacity-100 data-active:[&>svg]:text-sidebar-primary group-data-[collapsible=icon]:before:inset-y-1.5';

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
  const hasLegalRows = visibleStaffNavGroups(permissions).some((group) =>
    group.items.some((item) => 'parent' in item && item.parent === 'legal'),
  );
  // The app's legal forms are forms of the engine (RAPP-772, RAPP-773): each row opens its page.
  const systemFormIds = useSystemFormIds(hasLegalRows);
  const groups = visibleStaffNavGroups(permissions).map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const formId = systemFormIds[item.to] ?? null;
      return formId === null
        ? item
        : // The row's own address, read at run time: the menu links by string.
          ({ ...item, to: legalFormPath(formId) } as unknown as typeof item);
    }),
  }));
  // The legal forms the team created, under Condicions legals (RAPP-771).
  const legalForms = useLegalFormEntries(
    holdsAnyPermission(permissions, CUSTOM_FORMS_PERMISSIONS) && hasLegalRows,
    pathname,
  );
  const activePath = activeStaffNavPath(pathname, [
    ...groups.flatMap((group) => group.items),
    ...Object.values(STAFF_NAV_PARENTS),
    ...legalForms.map((form) => ({ to: legalFormPath(form.id) })),
  ]);

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
              legalForms={legalForms}
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

/** Where a created legal form opens: its board, the engine of every form (RAPP-771). */
function legalFormPath(id: string): string {
  return `/forms/custom/${id}`;
}

/** The menu's rows of the app's legal forms, which open their forms once read (RAPP-772, RAPP-773). */
const SYSTEM_FORM_PATHS = {
  '/forms/terms': 'app_terms',
  '/forms/authorization': 'season_authorization',
} as const;

/** The app's legal forms by their menu row, read once; empty until read, and on an older database. */
function useSystemFormIds(enabled: boolean): Readonly<Record<string, string | null>> {
  const [formIds, setFormIds] = useState<Readonly<Record<string, string | null>>>({});
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void Promise.all(
      Object.entries(SYSTEM_FORM_PATHS).map(async ([path, key]) => [
        path,
        await fetchSystemFormId(key, controller.signal),
      ]),
    ).then((loaded) => {
      if (!controller.signal.aborted) setFormIds(Object.fromEntries(loaded));
    });
    return () => controller.abort();
  }, [enabled]);
  return formIds;
}

/**
 * The legal forms the team created, read again as she moves around, so a form
 * she just created or archived shows in the menu.
 */
function useLegalFormEntries(enabled: boolean, pathname: string): readonly LegalFormEntry[] {
  const [forms, setForms] = useState<readonly LegalFormEntry[]>([]);
  useEffect(() => {
    if (!enabled) {
      setForms([]);
      return;
    }
    const controller = new AbortController();
    void fetchLegalFormEntries(supabase, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setForms(loaded);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, pathname]);
  return forms;
}

function StaffNavGroupSection({
  group,
  activePath,
  unread,
  legalForms,
}: {
  readonly group: StaffNavGroup;
  readonly activePath: string | null;
  readonly unread: number;
  readonly legalForms: readonly LegalFormEntry[];
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
            <NavRows rows={rows} activePath={activePath} unread={unread} legalForms={legalForms} />
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
  legalForms,
}: {
  readonly rows: readonly MenuRow[];
  readonly activePath: string | null;
  readonly unread: number;
  readonly legalForms: readonly LegalFormEntry[];
}) {
  const { t, i18n } = useTranslation('nav');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  return (
    <>
      {rows.map((row) => {
        if (row.kind === 'item') {
          return (
            <NavItemRow key={row.item.to} item={row.item} activePath={activePath} unread={unread} />
          );
        }
        const parent = STAFF_NAV_PARENTS[row.parent];
        const created = row.parent === 'legal' ? legalForms : [];
        return (
          <NavFold
            key={row.parent}
            foldKey={`parent:${row.parent}`}
            testId={row.parent}
            label={t(parent.labelKey)}
            icon={parent.icon}
            page={{ to: parent.to, isActive: parent.to === activePath }}
            holdsActive={
              row.items.some((item) => item.to === activePath) ||
              created.some((form) => legalFormPath(form.id) === activePath)
            }
          >
            {row.items.map((item) => (
              <NavItemRow key={item.to} item={item} activePath={activePath} unread={unread} />
            ))}
            {created.map((form) => (
              <NavItemRow
                key={form.id}
                item={{
                  to: legalFormPath(form.id),
                  icon: Scale,
                  label: textIn(form.name, language),
                }}
                activePath={activePath}
                unread={unread}
              />
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
 * under it. A row with a page of its own (RAPP-771, Condicions legals) opens
 * that page, and only its chevron folds.
 */
function NavFold({
  foldKey,
  testId,
  label,
  icon: Icon,
  page,
  holdsActive,
  children,
}: {
  readonly foldKey: string;
  readonly testId: string;
  readonly label: string;
  readonly icon: LucideIcon | null;
  readonly page?: { readonly to: string; readonly isActive: boolean };
  readonly holdsActive: boolean;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation('nav');
  const [isOpen, setIsOpen] = useFoldState(foldKey, holdsActive || page?.isActive === true);
  if (page !== undefined) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
        <SidebarMenuItem data-testid={`staff-nav-fold-${testId}`}>
          <SidebarMenuButton
            asChild
            isActive={page.isActive}
            tooltip={label}
            className={cn(NAV_BUTTON_CLASS, 'pe-8')}
          >
            <Link
              to={page.to}
              activeOptions={{ exact: true, includeSearch: false }}
              aria-current={page.isActive ? 'page' : undefined}
            >
              {Icon === null ? null : <Icon aria-hidden="true" />}
              <span>{label}</span>
            </Link>
          </SidebarMenuButton>
          <CollapsibleTrigger asChild>
            <SidebarMenuAction
              aria-label={t('a11y.toggleFold', { name: label })}
              aria-expanded={isOpen}
              className="top-2 text-sidebar-foreground"
              data-testid={`staff-nav-fold-${testId}-toggle`}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  'transition-transform motion-reduce:transition-none',
                  isOpen ? 'rotate-90' : 'rtl:rotate-180',
                )}
              />
            </SidebarMenuAction>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub className="me-0 pe-0">{children}</SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <SidebarMenuItem data-testid={`staff-nav-fold-${testId}`}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={label} className={NAV_BUTTON_CLASS}>
            {Icon === null ? null : <Icon aria-hidden="true" />}
            <span>{label}</span>
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'ms-auto transition-transform motion-reduce:transition-none',
                isOpen ? 'rotate-90' : 'rtl:rotate-180',
              )}
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
  /** A page of the menu, or a legal form the team created, named as typed (RAPP-771). */
  readonly item:
    GroupItem | { readonly to: string; readonly icon: LucideIcon; readonly label: string };
  readonly activePath: string | null;
  readonly unread: number;
}) {
  const { t } = useTranslation(['nav', 'messaging']);
  const label = 'label' in item ? item.label : t(item.labelKey);
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

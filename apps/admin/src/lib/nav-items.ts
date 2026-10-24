/**
 * The admin navigation maps (RAPP-16), kept as pure data so the shells' real
 * destinations are directly testable.
 *
 * Why this is its own module: `_staff` and `_entity` are PATHLESS layout routes,
 * so neither contributes a URL segment and two same-named children (both areas
 * legitimately have "messages") would resolve to the same path and collide in
 * the route tree. The entity area is therefore namespaced under `/portal`, and
 * `nav-items.test.ts` asserts the two maps can never overlap again.
 */

import {
  BellRing,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  ClipboardPen,
  Database,
  FileText,
  HeartHandshake,
  IdCard,
  Images,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Settings,
  Share2,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { designRoleRedirect } from './design-role-access';

export interface NavItem {
  readonly to: string;
  readonly icon: LucideIcon;
  readonly labelKey: string;
  /**
   * The item shows when the person holds ANY of these (RAPP-231). Absent means
   * every team member: the dashboard. A UX filter only; the database checks
   * every permission again.
   */
  readonly anyPermission?: readonly PermissionCode[];
}

/**
 * The staff menu groups by audience (RAPP-654): the two pages everyone starts
 * from on top, then what the players see in their app, what the partner
 * entities use, and how the organization itself is run.
 */
export type StaffNavGroupId = 'top' | 'app' | 'entities' | 'organisation';

export interface StaffNavItem extends NavItem {
  readonly group: StaffNavGroupId;
}

/** The groups in menu order; the top group has no label. */
export const STAFF_NAV_GROUPS = [
  { id: 'top', labelKey: null },
  { id: 'app', labelKey: 'nav:staff.groups.app' },
  { id: 'entities', labelKey: 'nav:staff.groups.entities' },
  { id: 'organisation', labelKey: 'nav:staff.groups.organisation' },
] as const satisfies readonly { id: StaffNavGroupId; labelKey: string | null }[];

/** The onboarding page: Settings' own permission, or the design role (RAPP-615). */
export const ONBOARDING_PERMISSIONS = [
  'settings.organization',
  'onboarding.design',
] as const satisfies readonly PermissionCode[];

/** The entity referral form (RAPP-652): the organization's own settings. */
export const REFERRAL_FORM_PERMISSIONS = [
  'settings.organization',
] as const satisfies readonly PermissionCode[];

/** The Data area: exports and the audit log. */
export const DATA_PERMISSIONS = [
  'export.participants',
  'export.participants_sensitive',
  'export.attendance',
  'export.events',
  'audit.view',
] as const satisfies readonly PermissionCode[];

/**
 * The Settings area: one tab per permission (organization and branding,
 * documents). The team, the partner entities and Dades de les jugadores have
 * their own pages since RAPP-654.
 */
export const SETTINGS_PERMISSIONS = [
  'settings.organization',
  'settings.branding',
  'settings.documents',
] as const satisfies readonly PermissionCode[];

/**
 * Dades de les jugadores (RAPP-650, its own page since RAPP-654): it decides
 * which data Ramassà asks for, so only its designers see it (RAPP-658), the
 * same permissions `private.require_question_builder` checks. It holds no answers.
 */
export const PROFILE_LAYOUT_PERMISSIONS = [
  'settings.organization',
  'onboarding.design',
] as const satisfies readonly PermissionCode[];

/** The team page (RAPP-654): people, presets and toggles. */
export const TEAM_PERMISSIONS = ['team.manage'] as const satisfies readonly PermissionCode[];

/** The partner entities and their contacts (RAPP-654). */
export const ENTITIES_PERMISSIONS = [
  'entities.manage',
] as const satisfies readonly PermissionCode[];

export const STAFF_NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav:staff.dashboard', group: 'top' },
  {
    to: '/participants',
    icon: Users,
    labelKey: 'nav:staff.participants',
    group: 'top',
    anyPermission: [
      'participants.view',
      'participants.invite',
      'referrals.manage',
      'rgpd.erase',
      'test_players.manage',
    ],
  },
  {
    // Everything a player sees in the onboarding, on its own page (RAPP-615).
    to: '/onboarding',
    icon: ListChecks,
    labelKey: 'nav:staff.onboarding',
    group: 'app',
    anyPermission: ONBOARDING_PERMISSIONS,
  },
  {
    to: '/content',
    icon: FileText,
    labelKey: 'nav:staff.content',
    group: 'app',
    anyPermission: [
      'announcements.edit',
      'announcements.publish',
      'events.edit',
      'events.publish',
      'knowledge.edit',
      'knowledge.publish',
      'services.edit',
      'services.publish',
      'services.review',
    ],
  },
  {
    to: '/attendance',
    icon: CalendarCheck,
    labelKey: 'nav:staff.attendance',
    group: 'app',
    anyPermission: ['attendance.mark', 'attendance.reports'],
  },
  {
    to: '/messages',
    icon: MessageSquare,
    labelKey: 'nav:staff.messages',
    group: 'app',
    anyPermission: ['messages.inbox'],
  },
  {
    to: '/forum',
    icon: MessageSquare,
    labelKey: 'nav:staff.forum',
    group: 'app',
    anyPermission: ['forum.moderate', 'gallery.moderate'],
  },
  {
    to: '/gallery',
    icon: Images,
    labelKey: 'nav:staff.gallery',
    group: 'app',
    anyPermission: ['gallery.moderate'],
  },
  {
    to: '/mentoring',
    icon: HeartHandshake,
    labelKey: 'nav:staff.mentoring',
    group: 'app',
    anyPermission: ['mentoring.manage'],
  },
  {
    to: '/feedback',
    icon: Inbox,
    labelKey: 'nav:staff.feedback',
    group: 'app',
    anyPermission: ['feedback.view'],
  },
  {
    to: '/surveys',
    icon: ClipboardList,
    labelKey: 'nav:staff.surveys',
    group: 'app',
    anyPermission: ['surveys.manage', 'surveys.results'],
  },
  {
    to: '/notifications',
    icon: BellRing,
    labelKey: 'nav:staff.notifications',
    group: 'app',
    anyPermission: ['notifications.send'],
  },
  {
    // The review queue keeps its URL under the roster (RAPP-654).
    to: '/participants/referrals',
    icon: Share2,
    labelKey: 'nav:staff.referrals',
    group: 'entities',
    anyPermission: ['referrals.manage'],
  },
  {
    to: '/entities/referral-form',
    icon: ClipboardPen,
    labelKey: 'nav:staff.referralForm',
    group: 'entities',
    anyPermission: REFERRAL_FORM_PERMISSIONS,
  },
  {
    to: '/entities',
    icon: Building2,
    labelKey: 'nav:staff.entities',
    group: 'entities',
    anyPermission: ENTITIES_PERMISSIONS,
  },
  {
    to: '/profile-layout',
    icon: IdCard,
    labelKey: 'nav:staff.profileLayout',
    group: 'organisation',
    anyPermission: PROFILE_LAYOUT_PERMISSIONS,
  },
  {
    to: '/team',
    icon: UsersRound,
    labelKey: 'nav:staff.team',
    group: 'organisation',
    anyPermission: TEAM_PERMISSIONS,
  },
  {
    // Who has re-registered for the current season (RAPP-306), under the roster.
    to: '/participants/season',
    icon: CalendarRange,
    labelKey: 'nav:staff.seasons',
    group: 'organisation',
    anyPermission: ['participants.view_personal'],
  },
  {
    to: '/data',
    icon: Database,
    labelKey: 'nav:staff.data',
    group: 'organisation',
    anyPermission: DATA_PERMISSIONS,
  },
  {
    to: '/settings',
    icon: Settings,
    labelKey: 'nav:staff.settings',
    group: 'organisation',
    anyPermission: SETTINGS_PERMISSIONS,
  },
] as const satisfies readonly StaffNavItem[];

/** Whether a permission-filtered item or route is open to this person. */
export function holdsAnyPermission(
  permissions: ReadonlySet<PermissionCode>,
  anyPermission: readonly PermissionCode[] | undefined,
): boolean {
  return anyPermission === undefined || anyPermission.some((code) => permissions.has(code));
}

type StaffNavEntry = (typeof STAFF_NAV_ITEMS)[number];

/**
 * The items a team member sees: those whose permissions she holds, and for the
 * onboarding design role only her three areas (RAPP-615, RAPP-654).
 */
export function visibleStaffNavItems(
  permissions: ReadonlySet<PermissionCode>,
): readonly StaffNavEntry[] {
  return STAFF_NAV_ITEMS.filter(
    (item) =>
      holdsAnyPermission(permissions, 'anyPermission' in item ? item.anyPermission : undefined) &&
      designRoleRedirect(item.to, permissions) === null,
  );
}

export interface StaffNavGroup {
  readonly id: StaffNavGroupId;
  readonly labelKey: string | null;
  readonly items: readonly StaffNavEntry[];
}

/** The menu's groups in order, each with its visible items; an empty group is left out. */
export function visibleStaffNavGroups(
  permissions: ReadonlySet<PermissionCode>,
): readonly StaffNavGroup[] {
  const visible = visibleStaffNavItems(permissions);
  return STAFF_NAV_GROUPS.map((group) => ({
    id: group.id,
    labelKey: group.labelKey,
    items: visible.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0);
}

/**
 * The one item marked as the current page: the longest destination the path
 * sits in, so `/participants/referrals` marks Derivacions and leaves
 * Participants unmarked.
 */
export function activeStaffNavPath(
  pathname: string,
  items: readonly Pick<NavItem, 'to'>[],
): string | null {
  let best: string | null = null;
  for (const item of items) {
    const isInside = pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (isInside && (best === null || item.to.length > best.length)) best = item.to;
  }
  return best;
}

export const ENTITY_NAV_ITEMS = [
  { to: '/portal', icon: LayoutDashboard, labelKey: 'nav:entity.dashboard' },
  { to: '/portal/referrals', icon: Share2, labelKey: 'nav:entity.referrals' },
  { to: '/portal/services', icon: Wrench, labelKey: 'nav:entity.services' },
  { to: '/portal/events', icon: CalendarDays, labelKey: 'nav:entity.events' },
  { to: '/portal/messages', icon: MessageSquare, labelKey: 'nav:entity.messages' },
] as const satisfies readonly NavItem[];

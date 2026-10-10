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
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Database,
  FileText,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Share2,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { PermissionCode } from '@ramassa/shared/permissions';

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

/** The Data area: exports and the audit log. */
export const DATA_PERMISSIONS = [
  'export.participants',
  'export.participants_sensitive',
  'export.attendance',
  'export.events',
  'audit.view',
] as const satisfies readonly PermissionCode[];

/** The Settings area: one tab per permission (organization, team, documents, entities). */
export const SETTINGS_PERMISSIONS = [
  'settings.organization',
  'settings.branding',
  'settings.documents',
  'entities.manage',
  'team.manage',
] as const satisfies readonly PermissionCode[];

export const STAFF_NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav:staff.dashboard' },
  {
    to: '/participants',
    icon: Users,
    labelKey: 'nav:staff.participants',
    anyPermission: ['participants.view', 'participants.invite', 'referrals.manage', 'rgpd.erase'],
  },
  {
    to: '/content',
    icon: FileText,
    labelKey: 'nav:staff.content',
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
    anyPermission: ['attendance.mark', 'attendance.reports'],
  },
  {
    to: '/messages',
    icon: MessageSquare,
    labelKey: 'nav:staff.messages',
    anyPermission: ['messages.inbox'],
  },
  {
    to: '/forum',
    icon: MessageSquare,
    labelKey: 'nav:staff.forum',
    anyPermission: ['forum.moderate', 'gallery.moderate'],
  },
  {
    to: '/mentoring',
    icon: HeartHandshake,
    labelKey: 'nav:staff.mentoring',
    anyPermission: ['mentoring.manage'],
  },
  {
    to: '/feedback',
    icon: Inbox,
    labelKey: 'nav:staff.feedback',
    anyPermission: ['feedback.view'],
  },
  {
    to: '/notifications',
    icon: BellRing,
    labelKey: 'nav:staff.notifications',
    anyPermission: ['notifications.send'],
  },
  {
    to: '/surveys',
    icon: ClipboardList,
    labelKey: 'nav:staff.surveys',
    anyPermission: ['surveys.manage', 'surveys.results'],
  },
  { to: '/data', icon: Database, labelKey: 'nav:staff.data', anyPermission: DATA_PERMISSIONS },
  {
    to: '/settings',
    icon: Settings,
    labelKey: 'nav:staff.settings',
    anyPermission: SETTINGS_PERMISSIONS,
  },
] as const satisfies readonly NavItem[];

/** Whether a permission-filtered item or route is open to this person. */
export function holdsAnyPermission(
  permissions: ReadonlySet<PermissionCode>,
  anyPermission: readonly PermissionCode[] | undefined,
): boolean {
  return anyPermission === undefined || anyPermission.some((code) => permissions.has(code));
}

export const ENTITY_NAV_ITEMS = [
  { to: '/portal', icon: LayoutDashboard, labelKey: 'nav:entity.dashboard' },
  { to: '/portal/referrals', icon: Share2, labelKey: 'nav:entity.referrals' },
  { to: '/portal/services', icon: Wrench, labelKey: 'nav:entity.services' },
  { to: '/portal/events', icon: CalendarDays, labelKey: 'nav:entity.events' },
  { to: '/portal/messages', icon: MessageSquare, labelKey: 'nav:entity.messages' },
] as const satisfies readonly NavItem[];

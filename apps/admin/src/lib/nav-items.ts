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
  CalendarCheck,
  CalendarDays,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Share2,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  readonly to: string;
  readonly icon: LucideIcon;
  readonly labelKey: string;
}

export const STAFF_NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav:staff.dashboard' },
  { to: '/participants', icon: Users, labelKey: 'nav:staff.participants' },
  { to: '/content', icon: FileText, labelKey: 'nav:staff.content' },
  { to: '/attendance', icon: CalendarCheck, labelKey: 'nav:staff.attendance' },
  { to: '/messages', icon: MessageSquare, labelKey: 'nav:staff.messages' },
  { to: '/settings', icon: Settings, labelKey: 'nav:staff.settings' },
] as const satisfies readonly NavItem[];

export const ENTITY_NAV_ITEMS = [
  { to: '/portal/referrals', icon: Share2, labelKey: 'nav:entity.referrals' },
  { to: '/portal/services', icon: Wrench, labelKey: 'nav:entity.services' },
  { to: '/portal/events', icon: CalendarDays, labelKey: 'nav:entity.events' },
  { to: '/portal/messages', icon: MessageSquare, labelKey: 'nav:entity.messages' },
] as const satisfies readonly NavItem[];

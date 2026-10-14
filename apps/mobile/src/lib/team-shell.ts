/**
 * The team area's shell (RAPP-245): which areas a team member may open in the
 * app, and how the app lays them out.
 *
 *   tabs     a phone with three or more areas: up to five bottom tabs
 *            (Today, Participants, Content, Messages, More)
 *   home     a phone with one or two areas: one screen of large buttons,
 *            which is easier than a tab bar for a person with one job
 *   sidebar  a tablet: a sidebar with every area, and list-and-detail views
 *
 * Areas join this list as their screens arrive (participants since RAPP-247,
 * stock since RAPP-250); the app is not used before every phase is
 * done, so an area without screens is simply not here yet.
 *
 * Stock is a More area (design: "More: ... stock"): it has no tab or sidebar
 * entry of its own, it opens from More, and from a large button on the
 * simple home. It still counts as an area, so a person whose only job is
 * stock gets that home.
 */
import type { PermissionCode } from '@ramassa/shared/permissions';

export type TeamArea = 'attendance' | 'participants' | 'content' | 'messages' | 'stock';

/** The content types the Content area holds, in the web admin's menu order. */
export type ContentKind = 'announcements' | 'events' | 'knowledge' | 'services';

/**
 * The content types a person manages (RAPP-340 announcements, RAPP-342
 * events, RAPP-343 knowledge, RAPP-344 services).
 */
export function contentKinds(permissions: ReadonlySet<PermissionCode>): readonly ContentKind[] {
  const kinds: ContentKind[] = [];
  if (permissions.has('announcements.edit') || permissions.has('announcements.publish')) {
    kinds.push('announcements');
  }
  if (permissions.has('events.edit') || permissions.has('events.publish')) kinds.push('events');
  if (permissions.has('knowledge.edit') || permissions.has('knowledge.publish')) {
    kinds.push('knowledge');
  }
  if (permissions.has('services.edit') || permissions.has('services.publish')) {
    kinds.push('services');
  }
  return kinds;
}

export type TeamLayout = 'tabs' | 'home' | 'sidebar';

/** iPad mini portrait and most Android tablets start here. */
const TABLET_MIN_WIDTH = 768;

/**
 * Below this a tablet (upright, most of them) gets a narrow rail with the icon
 * over the label, so the open item keeps enough width beside its list.
 */
const WIDE_SIDEBAR_MIN_WIDTH = 1100;

export function isCompactSidebar(width: number): boolean {
  return width < WIDE_SIDEBAR_MIN_WIDTH;
}

const HOME_MAX_AREAS = 2;

export function teamAreas(permissions: ReadonlySet<PermissionCode>): readonly TeamArea[] {
  const areas: TeamArea[] = [];
  if (permissions.has('attendance.mark') || permissions.has('attendance.reports')) {
    areas.push('attendance');
  }
  if (permissions.has('participants.view')) areas.push('participants');
  if (contentKinds(permissions).length > 0) areas.push('content');
  if (permissions.has('messages.inbox')) areas.push('messages');
  if (
    permissions.has('equipment.receive') ||
    permissions.has('equipment.count') ||
    permissions.has('equipment.items')
  ) {
    areas.push('stock');
  }
  return areas;
}

export function teamLayout(input: {
  readonly areaCount: number;
  readonly width: number;
}): TeamLayout {
  if (input.width >= TABLET_MIN_WIDTH) return 'sidebar';
  return input.areaCount <= HOME_MAX_AREAS ? 'home' : 'tabs';
}

/** Where a team member starts: the large-button home, or her first area. */
export function teamStart(
  areas: readonly TeamArea[],
  layout: TeamLayout,
): '/home' | '/today' | '/participants' | '/content' | '/messages' | '/more' | '/team-home' {
  if (areas.length === 0) return '/team-home';
  if (layout === 'home') return '/home';
  if (areas.includes('attendance')) return '/today';
  if (areas.includes('participants')) return '/participants';
  if (areas.includes('content')) return '/content';
  // Stock alone: More holds it.
  return areas.includes('messages') ? '/messages' : '/more';
}

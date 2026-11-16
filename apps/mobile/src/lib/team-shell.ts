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
 *
 * Avui (RAPP-795) is everyone's start: today's sessions for whoever takes
 * attendance, then the "Pendent" list. More (RAPP-796, RAPP-797) is six headed
 * groups and is reachable from every layout; a person whose permissions open
 * only More tools starts on the large-button home. The notice that points to
 * the web shows only when the app has no screen at all for her.
 */
import type { PermissionCode } from '@ramassa/shared/permissions';
import { hasPermittedQueue } from './today';

export type TeamArea = 'attendance' | 'participants' | 'content' | 'messages' | 'stock';

/** The content types the Content area holds, in the web admin's menu order. */
export type ContentKind = 'announcements' | 'events' | 'knowledge' | 'services' | 'reviews';

/**
 * The content types a person manages (RAPP-340 announcements, RAPP-342
 * events, RAPP-343 knowledge, RAPP-344 services, RAPP-345 the review queue of
 * services that partner entities submit).
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
  if (permissions.has('services.review')) kinds.push('reviews');
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

export type MoreGroup = 'field' | 'players' | 'communication' | 'data' | 'organization' | 'app';

export type MoreEntry =
  | 'collectSignatures'
  | 'stock'
  | 'mentoring'
  | 'feedback'
  | 'moderation'
  | 'notifications'
  | 'surveys'
  | 'impact'
  | 'data'
  | 'documents'
  | 'staff'
  | 'entities'
  | 'organization'
  | 'preview'
  | 'settings'
  | 'signOut';

/** Any of these codes opens the entry; `null` means every team member. */
const MORE_GROUPS: readonly {
  readonly group: MoreGroup;
  readonly entries: readonly {
    readonly entry: MoreEntry;
    readonly anyOf: readonly PermissionCode[] | null;
  }[];
}[] = [
  {
    group: 'field',
    entries: [
      { entry: 'collectSignatures', anyOf: ['consents.collect'] },
      { entry: 'stock', anyOf: ['equipment.receive', 'equipment.count', 'equipment.items'] },
    ],
  },
  {
    group: 'players',
    entries: [
      { entry: 'mentoring', anyOf: ['mentoring.manage'] },
      { entry: 'feedback', anyOf: ['feedback.view'] },
      { entry: 'moderation', anyOf: ['forum.moderate', 'gallery.moderate'] },
    ],
  },
  {
    group: 'communication',
    entries: [
      { entry: 'notifications', anyOf: ['notifications.send'] },
      { entry: 'surveys', anyOf: ['surveys.manage', 'surveys.results'] },
    ],
  },
  {
    group: 'data',
    entries: [
      { entry: 'impact', anyOf: ['impact.view'] },
      {
        entry: 'data',
        anyOf: [
          'export.participants',
          'export.participants_sensitive',
          'export.attendance',
          'export.events',
          'audit.view',
        ],
      },
      { entry: 'documents', anyOf: ['settings.documents'] },
    ],
  },
  {
    group: 'organization',
    entries: [
      { entry: 'staff', anyOf: ['team.manage'] },
      { entry: 'entities', anyOf: ['entities.manage'] },
      { entry: 'organization', anyOf: ['settings.organization', 'settings.branding'] },
    ],
  },
  {
    group: 'app',
    entries: [
      { entry: 'preview', anyOf: null },
      { entry: 'settings', anyOf: null },
      { entry: 'signOut', anyOf: null },
    ],
  },
];

/** More's groups with the entries she may open; a group with none is left out. */
export function moreGroups(
  permissions: ReadonlySet<PermissionCode>,
): readonly { readonly group: MoreGroup; readonly entries: readonly MoreEntry[] }[] {
  return MORE_GROUPS.map(({ group, entries }) => ({
    group,
    entries: entries
      .filter(({ anyOf }) => anyOf === null || anyOf.some((code) => permissions.has(code)))
      .map(({ entry }) => entry),
  })).filter(({ entries }) => entries.length > 0);
}

/** Whether More holds a tool of hers, beyond the app group every member has. */
export function hasMoreEntries(permissions: ReadonlySet<PermissionCode>): boolean {
  return moreGroups(permissions).some(({ group }) => group !== 'app');
}

/** Avui opens with attendance or with any queue her own permissions open. */
export function showsToday(permissions: ReadonlySet<PermissionCode>): boolean {
  return teamAreas(permissions).includes('attendance') || hasPermittedQueue(permissions);
}

/** Whether the app has any screen for her: an area, Avui, or a More tool. */
export function hasTeamAppScreen(permissions: ReadonlySet<PermissionCode>): boolean {
  return (
    teamAreas(permissions).length > 0 || showsToday(permissions) || hasMoreEntries(permissions)
  );
}

/**
 * Where a team member starts: the large-button home on a phone with one or
 * two areas, otherwise Avui when she has it, then her first area, then More.
 */
export function teamStart(
  areas: readonly TeamArea[],
  layout: TeamLayout,
  reach: { readonly today: boolean; readonly more: boolean },
): '/home' | '/today' | '/participants' | '/content' | '/messages' | '/more' | '/team-home' {
  if (areas.length === 0 && !reach.today && !reach.more) return '/team-home';
  if (layout === 'home') return '/home';
  if (reach.today) return '/today';
  if (areas.includes('participants')) return '/participants';
  if (areas.includes('content')) return '/content';
  if (areas.includes('messages')) return '/messages';
  // Stock alone, or only More tools: More holds them.
  return '/more';
}

/** Her start, from her permissions and the screen width. */
export function teamHome(
  permissions: ReadonlySet<PermissionCode>,
  width: number,
): ReturnType<typeof teamStart> {
  const areas = teamAreas(permissions);
  return teamStart(areas, teamLayout({ areaCount: areas.length, width }), {
    today: showsToday(permissions),
    more: hasMoreEntries(permissions),
  });
}

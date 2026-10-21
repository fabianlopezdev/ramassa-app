/**
 * The team permission catalog (RAPP-229, design:
 * docs/plans/2026-10-08-native-management-app-design.md).
 *
 * Each permission is one toggle that names exactly what it opens. The same list
 * lives in the database (`public.permissions`, migration
 * `20261010170000_permission_catalog.sql`, restated by later migrations that
 * add a permission), and
 * `tests/permission-catalog-parity.test.ts` keeps the two equal, including the
 * order and the area of every entry.
 */

export const PERMISSION_AREAS = [
  'participants',
  'material',
  'attendance',
  'content',
  'community',
  'entities',
  'impact',
  'settings',
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];

export const PERMISSION_CATALOG = [
  { code: 'participants.view', area: 'participants' },
  { code: 'participants.view_personal', area: 'participants' },
  { code: 'participants.view_sensitive', area: 'participants' },
  // Her medical answer from the authorization (RAPP-304). Only Admin by default.
  { code: 'participants.view_health', area: 'participants' },
  // Hand a tablet to a player to sign the authorization (RAPP-305).
  { code: 'consents.collect', area: 'participants' },
  { code: 'participants.notes', area: 'participants' },
  { code: 'participants.invite', area: 'participants' },
  { code: 'participants.deactivate', area: 'participants' },
  { code: 'rgpd.erase', area: 'participants' },
  // Create, view, edit and delete test players, and never a real one (RAPP-615).
  { code: 'test_players.manage', area: 'participants' },
  { code: 'equipment.handover', area: 'material' },
  { code: 'equipment.receive', area: 'material' },
  { code: 'equipment.count', area: 'material' },
  { code: 'equipment.items', area: 'material' },
  { code: 'attendance.mark', area: 'attendance' },
  { code: 'attendance.reports', area: 'attendance' },
  { code: 'announcements.edit', area: 'content' },
  { code: 'announcements.publish', area: 'content' },
  { code: 'events.edit', area: 'content' },
  { code: 'events.publish', area: 'content' },
  { code: 'knowledge.edit', area: 'content' },
  { code: 'knowledge.publish', area: 'content' },
  { code: 'services.edit', area: 'content' },
  { code: 'services.publish', area: 'content' },
  { code: 'services.review', area: 'content' },
  { code: 'forum.moderate', area: 'community' },
  { code: 'gallery.moderate', area: 'community' },
  { code: 'messages.inbox', area: 'community' },
  { code: 'mentoring.manage', area: 'community' },
  { code: 'feedback.view', area: 'community' },
  { code: 'surveys.manage', area: 'community' },
  { code: 'surveys.results', area: 'community' },
  { code: 'notifications.send', area: 'community' },
  { code: 'referrals.manage', area: 'entities' },
  { code: 'entities.manage', area: 'entities' },
  { code: 'impact.view', area: 'impact' },
  { code: 'export.participants', area: 'impact' },
  { code: 'export.participants_sensitive', area: 'impact' },
  { code: 'export.attendance', area: 'impact' },
  { code: 'export.events', area: 'impact' },
  { code: 'audit.view', area: 'impact' },
  { code: 'settings.organization', area: 'settings' },
  // Everything a player sees in the onboarding: questions, the document note,
  // seasons and the season authorization (RAPP-615).
  { code: 'onboarding.design', area: 'settings' },
  { code: 'settings.branding', area: 'settings' },
  { code: 'settings.documents', area: 'settings' },
  { code: 'team.manage', area: 'settings' },
] as const satisfies readonly { code: string; area: PermissionArea }[];

export type PermissionCode = (typeof PERMISSION_CATALOG)[number]['code'];

export const BUILTIN_PRESET_KEYS = ['coach', 'staff', 'admin', 'onboarding_design'] as const;

export type BuiltinPresetKey = (typeof BUILTIN_PRESET_KEYS)[number];

const STAFF_DEFAULT_AREAS: readonly PermissionArea[] = [
  'material',
  'attendance',
  'content',
  'community',
];

const STAFF_DEFAULT_EXTRAS: readonly PermissionCode[] = [
  'participants.view',
  'consents.collect',
  'participants.view_personal',
  'participants.notes',
  'participants.invite',
  'participants.deactivate',
  'referrals.manage',
  'impact.view',
];

/** The product defaults that "Restore default" brings back. */
export const BUILTIN_PRESET_DEFAULTS: Readonly<
  Record<BuiltinPresetKey, readonly PermissionCode[]>
> = {
  coach: [
    'participants.view',
    'consents.collect',
    'equipment.handover',
    'attendance.mark',
    'attendance.reports',
    'messages.inbox',
  ],
  staff: PERMISSION_CATALOG.filter(
    (permission) =>
      STAFF_DEFAULT_AREAS.includes(permission.area) ||
      STAFF_DEFAULT_EXTRAS.includes(permission.code),
  ).map((permission) => permission.code),
  admin: PERMISSION_CATALOG.map((permission) => permission.code),
  // The onboarding design sandbox (RAPP-615): the onboarding settings and the
  // test players, nothing else.
  onboarding_design: ['test_players.manage', 'onboarding.design'],
};

/** The two permissions of the onboarding design role (RAPP-615). */
export const ONBOARDING_DESIGN_PERMISSIONS = BUILTIN_PRESET_DEFAULTS.onboarding_design;

/**
 * The Today tab (RAPP-246): what needs doing now, limited to what the person
 * may do and what the app can do itself. One section per area, in a fixed
 * order with field work first. Each later phase adds its own section here
 * (participants and material in phase 2, the review queue, forum reports,
 * mentoring and deletion requests in phases 3 to 5); the app ships only when
 * every phase is done, so no section points to the web admin.
 */
import type { PermissionCode } from '@ramassa/shared/permissions';
import type { TeamArea } from './team-shell';

export type TodaySection = 'attendance' | 'material' | 'messages';

const ORDER: readonly TodaySection[] = ['attendance', 'material', 'messages'];

/** Stock below zero is for whoever counts it or hands it out (RAPP-249). */
const MATERIAL_PERMISSIONS: readonly PermissionCode[] = ['equipment.count', 'equipment.handover'];

export function todaySections(
  areas: readonly TeamArea[],
  permissions: ReadonlySet<PermissionCode>,
): readonly TodaySection[] {
  return ORDER.filter((section) =>
    section === 'material'
      ? MATERIAL_PERMISSIONS.some((permission) => permissions.has(permission))
      : areas.includes(section),
  );
}

/**
 * The one moderation screen (RAPP-802): a Fòrum segment for `forum.moderate`
 * and a Galeria segment for `gallery.moderate`. Either permission opens it.
 * A reported photo belongs to the Galeria segment only, so it is never in two
 * queues.
 */
import type { PermissionCode } from '@ramassa/shared/permissions';

const MODERATION_SEGMENTS = ['forum', 'gallery'] as const;
export type ModerationSegment = (typeof MODERATION_SEGMENTS)[number];

const SEGMENT_PERMISSION = {
  forum: 'forum.moderate',
  gallery: 'gallery.moderate',
} as const satisfies Record<ModerationSegment, PermissionCode>;

export function moderationSegments(
  permissions: ReadonlySet<PermissionCode>,
): readonly ModerationSegment[] {
  return MODERATION_SEGMENTS.filter((segment) => permissions.has(SEGMENT_PERMISSION[segment]));
}

/** The segment a link asks for when she may see it, else her first one. */
export function selectedModerationSegment(
  available: readonly ModerationSegment[],
  requested: string | undefined,
): ModerationSegment | null {
  const match = available.find((segment) => segment === requested);
  return match ?? available[0] ?? null;
}

export function splitModerationQueue<Row extends { readonly target_type: string }>(
  rows: readonly Row[],
): { readonly forum: readonly Row[]; readonly gallery: readonly Row[] } {
  return {
    forum: rows.filter((row) => row.target_type !== 'media'),
    gallery: rows.filter((row) => row.target_type === 'media'),
  };
}

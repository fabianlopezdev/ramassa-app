/** The gallery moderation filters (RAPP-381): hidden includes pending review. */
import type { MediaItemRow } from '@ramassa/shared/media';

export type GalleryFilter = 'all' | 'visible' | 'hidden';

export function filterGallery(
  items: readonly MediaItemRow[],
  filter: GalleryFilter,
): readonly MediaItemRow[] {
  if (filter === 'all') return items;
  return items.filter((item) =>
    filter === 'visible'
      ? item.moderation_state === 'visible'
      : item.moderation_state !== 'visible',
  );
}

import { expect, test } from 'bun:test';
import type { MediaItemRow } from '@ramassa/shared/media';
import { filterGallery } from './gallery-filter';

const item = (id: string, moderation_state: MediaItemRow['moderation_state']) =>
  ({ id, moderation_state }) as MediaItemRow;

test('the filters split visible items from hidden ones, pending review included', () => {
  const items = [item('a', 'visible'), item('b', 'hidden'), item('c', 'hidden_pending_review')];
  expect(filterGallery(items, 'all').map((row) => row.id)).toEqual(['a', 'b', 'c']);
  expect(filterGallery(items, 'visible').map((row) => row.id)).toEqual(['a']);
  expect(filterGallery(items, 'hidden').map((row) => row.id)).toEqual(['b', 'c']);
});

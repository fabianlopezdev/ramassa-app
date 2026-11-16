import { describe, expect, test } from 'bun:test';
import type { PermissionCode } from '@ramassa/shared/permissions';
import {
  moderationSegments,
  selectedModerationSegment,
  splitModerationQueue,
} from './team-moderation';

const held = (...codes: PermissionCode[]) => new Set<PermissionCode>(codes);

describe('the moderation screen (RAPP-802)', () => {
  test('each segment shows with its own permission', () => {
    expect(moderationSegments(held('forum.moderate', 'gallery.moderate'))).toEqual([
      'forum',
      'gallery',
    ]);
    expect(moderationSegments(held('forum.moderate'))).toEqual(['forum']);
    expect(moderationSegments(held('gallery.moderate'))).toEqual(['gallery']);
    expect(moderationSegments(held('messages.inbox'))).toEqual([]);
  });

  test('a link picks its segment only when she may see it', () => {
    expect(selectedModerationSegment(['forum', 'gallery'], 'gallery')).toBe('gallery');
    expect(selectedModerationSegment(['forum', 'gallery'], undefined)).toBe('forum');
    expect(selectedModerationSegment(['forum'], 'gallery')).toBe('forum');
    expect(selectedModerationSegment(['gallery'], 'forum')).toBe('gallery');
    expect(selectedModerationSegment(['forum', 'gallery'], 'nonsense')).toBe('forum');
    expect(selectedModerationSegment([], 'forum')).toBeNull();
  });

  test('a reported photo sits in the gallery queue only', () => {
    const rows = [
      { target_type: 'post', target_id: 'p' },
      { target_type: 'media', target_id: 'm' },
      { target_type: 'reply', target_id: 'r' },
    ] as const;
    const { forum, gallery } = splitModerationQueue(rows);
    expect(forum.map((row) => row.target_id)).toEqual(['p', 'r']);
    expect(gallery.map((row) => row.target_id)).toEqual(['m']);
  });
});

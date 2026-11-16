import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const readMobileSource = (path: string) => readFile(`${mobileRoot}${path}`, 'utf8');

describe('RAPP-65 player hardening contract', () => {
  test('gallery list has distinct shared loading, empty, offline, and taxonomy error states', async () => {
    // The grid owns its states; the shell owns the one offline banner (RAPP-807).
    const gallery = await readMobileSource('components/gallery/gallery-grid.tsx');
    const galleryRoute = await readMobileSource('app/(app)/gallery/index.tsx');
    const community = await readMobileSource('app/(app)/(tabs)/community.tsx');
    const shell = await readMobileSource('app/(app)/_layout.tsx');

    expect(gallery).toContain('AnnouncementFeedSkeleton');
    expect(gallery).toContain('AnnouncementEmptyState');
    expect(gallery).toContain('AnnouncementFeedError');
    expect(galleryRoute).not.toContain('OfflineBanner');
    expect(community).not.toContain('OfflineBanner');
    expect(shell).toContain('<ShellOfflineFrame>');
    expect(gallery).toContain("isOnline ? 'emptyTitle' : 'offlineEmptyTitle'");
    expect(gallery).toContain('toAppError(query.error).code');
    expect(gallery).not.toContain("t(query.isPending ? 'loading' : 'empty')");
  });

  test('gallery detail uses the shared skeleton and shows cached content under the shell offline banner', async () => {
    const detail = await readMobileSource('app/(app)/gallery/[id].tsx');

    expect(detail).toContain('AnnouncementFeedSkeleton');
    expect(detail).not.toContain('OfflineBanner');
    expect(detail).toContain("t('gallery:offlineEmptyTitle')");
    expect(detail).not.toContain('query.isPending && item === undefined ? (');
  });

  test('announcement detail distinguishes loading, taxonomy error, and empty states', async () => {
    const detail = await readMobileSource('app/(app)/announcement/[id].tsx');

    expect(detail).toContain('AnnouncementFeedSkeleton');
    expect(detail).toContain('AnnouncementFeedError');
    expect(detail).toContain('query.isPending');
    expect(detail).toContain('query.isError');
    expect(detail).toContain('toAppError(query.error).code');
  });

  test('content loading paths use skeletons instead of indefinite spinners', async () => {
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');
    const messageThread = await readMobileSource('components/messaging/message-thread.tsx');

    expect(forumDetail).toContain('AnnouncementFeedSkeleton');
    expect(messageThread).toContain('AnnouncementFeedSkeleton');
    expect(forumDetail).not.toContain('<ActivityIndicator');
    expect(messageThread).not.toContain('<ActivityIndicator');
  });

  test('an offline cold-started private thread resolves to its translated empty state', async () => {
    const messageThread = await readMobileSource('components/messaging/message-thread.tsx');

    expect(messageThread).toContain('if (isPending && isOnline)');
    expect(messageThread).toContain("t('offline')");
    expect(messageThread).toContain("title={t('emptyTitle')}");
    expect(messageThread).toContain("body={t('emptyBody')}");
  });

  test('forum reply failures show friendly guidance and retry instead of an empty thread', async () => {
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');

    expect(forumDetail).toContain('repliesQuery.isError');
    expect(forumDetail).toContain("t('forum:loadFailed')");
    expect(forumDetail).toContain('refetchReplies()');
    expect(forumDetail).not.toContain('ErrorCodeLine');
  });
});

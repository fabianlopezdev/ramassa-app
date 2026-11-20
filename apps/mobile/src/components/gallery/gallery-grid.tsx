import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { GalleryTile } from '@/components/gallery/gallery-tile';
import { NO_UNOPENED_IDS } from '@/lib/community-news';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useGalleryItems } from '@/lib/player-gallery';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTabNews } from '@/lib/use-tab-news';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import type { MediaItemRow } from '@ramassa/shared/media';
import { tokens } from '@ramassa/shared/tokens';

const GALLERY_COLUMN_COUNT = 2;
const EMPTY_GALLERY_ITEMS: readonly MediaItemRow[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
});
const keyExtractor = (item: MediaItemRow) => item.id;

/**
 * The player gallery grid: the Galeria segment of Comunitat and the standalone
 * gallery route render this one list (RAPP-792). The caller owns the header,
 * so loading and error states sit under it and the screen keeps its controls.
 */
export function GalleryGrid({
  header,
  contentContainerStyle,
  unopenedItemIds = NO_UNOPENED_IDS,
}: {
  readonly header: ReactElement;
  readonly contentContainerStyle: StyleProp<ViewStyle>;
  /** Photos she has not opened yet, marked "Nou" until she does (RAPP-873). */
  readonly unopenedItemIds?: ReadonlySet<string>;
}) {
  const { t } = useTranslation(['gallery', 'home']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { session } = useAuth();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const query = useGalleryItems();
  const refetchGallery = query.refetch;
  // Pull to refresh also asks again what is new for her (RAPP-873).
  const refetchTabNews = useTabNews().refetch;
  const accessToken = session?.access_token;
  const openItem = useCallback(
    (id: string) => push({ pathname: '/gallery/[id]', params: { id } } as unknown as Href),
    [push],
  );
  const refresh = useCallback(() => {
    void Promise.all([refetchGallery(), refetchTabNews()]);
  }, [refetchGallery, refetchTabNews]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MediaItemRow>) => {
      const unseenLabel = unopenedItemIds.has(item.id) ? t('home:unseen') : null;
      // The tile does not read its mark aloud, so its label says the word first.
      const openLabel = t('openItem', { name: item.uploader_first_name });
      return (
        <GalleryTile
          id={item.id}
          objectKeyOrUrl={item.thumbnail_url ?? item.file_url}
          accessToken={accessToken}
          accessibilityLabel={unseenLabel === null ? openLabel : `${unseenLabel}. ${openLabel}`}
          imageAlt={item.caption ?? t('mediaBy', { name: item.uploader_first_name })}
          onOpen={openItem}
          unseenLabel={unseenLabel}
        />
      );
    },
    [accessToken, openItem, t, unopenedItemIds],
  );

  const hasNoData = query.data === undefined && isOnline;
  let emptyState: ReactElement;
  if (query.isPending && hasNoData) {
    emptyState = <AnnouncementFeedSkeleton accessibilityLabel={t('loading')} />;
  } else if (query.isError && hasNoData) {
    emptyState = (
      <AnnouncementFeedError
        message={t('loadFailed')}
        retryLabel={t('retry')}
        code={toAppError(query.error).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
        isLoading={query.isRefetching}
      />
    );
  } else {
    emptyState = (
      <AnnouncementEmptyState
        title={t(isOnline ? 'emptyTitle' : 'offlineEmptyTitle')}
        body={t(isOnline ? 'emptyBody' : 'offlineEmptyBody')}
        languageFontClass={languageFontClass}
      />
    );
  }

  return (
    <FlashList
      testID="gallery-grid"
      data={query.data ?? EMPTY_GALLERY_ITEMS}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={unopenedItemIds}
      numColumns={GALLERY_COLUMN_COUNT}
      style={styles.screen}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={header}
      ListEmptyComponent={emptyState}
      refreshing={query.isRefetching && isOnline}
      onRefresh={refresh}
    />
  );
}

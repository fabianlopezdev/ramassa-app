import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { GalleryTile } from '@/components/gallery/gallery-tile';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useGalleryItems } from '@/lib/player-gallery';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import type { MediaItemRow } from '@ramassa/shared/media';
import { tokens } from '@ramassa/shared/tokens';

const GALLERY_COLUMN_COUNT = 2;
const EMPTY_GALLERY_ITEMS: readonly MediaItemRow[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  content: { padding: tokens.spacing.md, paddingBottom: tokens.spacing['3xl'] },
});
const keyExtractor = (item: MediaItemRow) => item.id;

export default function GalleryScreen() {
  const { t } = useTranslation('gallery');
  const languageFontClass = useLanguageFontClass();
  const { push, back } = useRouter();
  const { session } = useAuth();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const query = useGalleryItems();
  const refetchGallery = query.refetch;
  const accessToken = session?.access_token;
  const openItem = useCallback(
    (id: string) => push({ pathname: '/gallery/[id]', params: { id } } as unknown as Href),
    [push],
  );
  const openUpload = useCallback(() => push('/gallery/upload' as Href), [push]);
  const refresh = useCallback(() => void refetchGallery(), [refetchGallery]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MediaItemRow>) => (
      <GalleryTile
        id={item.id}
        objectKeyOrUrl={item.thumbnail_url ?? item.file_url}
        accessToken={accessToken}
        accessibilityLabel={t('openItem', { name: item.uploader_first_name })}
        imageAlt={item.caption ?? t('mediaBy', { name: item.uploader_first_name })}
        onOpen={openItem}
      />
    ),
    [accessToken, openItem, t],
  );
  const header = useMemo(
    () => (
      <PageWidth className="gap-md pb-lg">
        <PressableScale
          accessibilityLabel={t('back')}
          onPress={back}
          haptic="tapLight"
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`font-medium text-primary ${languageFontClass}`}>{t('back')}</Text>
        </PressableScale>
        <View className="gap-xs">
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold ${languageFontClass}`}
          >
            {t('title')}
          </Text>
          <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
            {t('intro')}
          </Text>
        </View>
        {!isOnline ? (
          <OfflineBanner label={t('offline')} languageFontClass={languageFontClass} />
        ) : null}
        <PressableScale
          testID="gallery-upload"
          accessibilityLabel={t('upload')}
          onPress={openUpload}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`font-bold text-white ${languageFontClass}`}>{t('upload')}</Text>
        </PressableScale>
      </PageWidth>
    ),
    [back, isOnline, languageFontClass, openUpload, t],
  );

  if (query.isPending && query.data === undefined && isOnline) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('loading')} />;
  }
  if (query.isError && query.data === undefined && isOnline) {
    return (
      <AnnouncementFeedError
        message={t('loadFailed')}
        retryLabel={t('retry')}
        code={toAppError(query.error).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
        isLoading={query.isRefetching}
      />
    );
  }

  return (
    <FlashList
      testID="gallery-grid"
      data={query.data ?? EMPTY_GALLERY_ITEMS}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={GALLERY_COLUMN_COUNT}
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={header}
      ListEmptyComponent={
        <AnnouncementEmptyState
          title={t(isOnline ? 'emptyTitle' : 'offlineEmptyTitle')}
          body={t(isOnline ? 'emptyBody' : 'offlineEmptyBody')}
          languageFontClass={languageFontClass}
        />
      }
      refreshing={query.isRefetching && isOnline}
      onRefresh={refresh}
    />
  );
}

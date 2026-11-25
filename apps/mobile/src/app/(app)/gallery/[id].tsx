import {
  AnnouncementEmptyState,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { GalleryItemActions } from '@/components/gallery/gallery-item-actions';
import { GalleryVideoStage } from '@/components/gallery/gallery-media-stage';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { isNetworkStateOnline } from '@/lib/network-status';
import { galleryPhotoHref, isGalleryPhoto, useGalleryItem } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMarkGalleryItemSeen } from '@/lib/use-tab-news';
import { useNetworkState } from 'expo-network';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { buildMediaObjectUrl } from '@ramassa/shared/upload-client';

const styles = StyleSheet.create({
  caption: { writingDirection: 'auto' },
});

/**
 * An opened gallery video, with its player and what it offers under it
 * (RAPP-897). A photo opens in the lightbox (RAPP-931): a link or a
 * notification that names a photo lands here and goes on to the lightbox.
 */
export default function GalleryItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation(['gallery']);
  const languageFontClass = useLanguageFontClass();
  const { session } = useAuth();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const query = useGalleryItem(id);
  const refetchItem = query.refetch;
  const retryLoad = useCallback(() => void refetchItem(), [refetchItem]);
  // The media may be as tall as the part of the screen the page scrolls in,
  // short of the home indicator, so a title at its bottom edge stays clear of it.
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  const measurePage = useCallback(
    (event: LayoutChangeEvent) => setPageHeight(event.nativeEvent.layout.height),
    [],
  );
  const { bottom: homeIndicatorHeight } = useSafeAreaInsets();
  const mediaMaxHeight = pageHeight === null ? null : pageHeight - homeIndicatorHeight;
  // A long title shows three lines on the media; the whole text then goes under it.
  const [isTitleCut, setIsTitleCut] = useState(false);
  const item = query.data;
  const isPhoto = item !== undefined && isGalleryPhoto(item);
  // A photo is marked seen by the lightbox it goes on to.
  useMarkGalleryItemSeen(isPhoto ? undefined : item?.id);
  const accessToken = session?.access_token;
  const videoUri =
    item?.file_type === 'video' && mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL !== undefined
      ? buildMediaObjectUrl(mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL, item.file_url)
      : null;
  const isPlayableVideo =
    item?.file_type === 'video' && videoUri !== null && accessToken !== undefined;
  const videoSource = useMemo(
    () =>
      videoUri === null || accessToken === undefined
        ? null
        : { uri: videoUri, headers: { authorization: `Bearer ${accessToken}` } },
    [accessToken, videoUri],
  );

  if (isPhoto) return <Redirect href={galleryPhotoHref(item.id)} />;

  if (query.isPending && item === undefined && isOnline) {
    return (
      <>
        <NativeScreenHeader surface="white" />
        <AnnouncementFeedSkeleton accessibilityLabel={t('gallery:loading')} />
      </>
    );
  }

  return (
    <>
      <NativeScreenHeader surface="white" />
      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="grow pb-lg"
        contentInsetAdjustmentBehavior="automatic"
        onLayout={measurePage}
      >
        <PageWidth className="gap-lg">
          {item === undefined && !isOnline ? (
            <View className="px-lg pt-lg">
              <AnnouncementEmptyState
                title={t('gallery:offlineEmptyTitle')}
                body={t('gallery:offlineEmptyBody')}
                languageFontClass={languageFontClass}
              />
            </View>
          ) : item === undefined ? (
            <View testID="gallery-detail-load-error" className="gap-md px-lg py-xl">
              <Text
                selectable
                accessibilityRole="alert"
                className={`text-start text-xl font-bold text-error ${languageFontClass}`}
              >
                {t('gallery:loadFailed')}
              </Text>
              <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
                {t('gallery:loadFailedHelp')}
              </Text>
              <AuthSubmitButton
                testID="gallery-detail-retry"
                label={t('gallery:retry')}
                onPress={retryLoad}
              />
            </View>
          ) : (
            <>
              {/* A video runs from edge to edge with its title on it; the text
                  under it keeps the screen's side margins (RAPP-897). */}
              {isPlayableVideo && videoSource !== null ? (
                <GalleryVideoStage
                  source={videoSource}
                  accessibilityLabel={
                    item.caption ?? t('gallery:mediaBy', { name: item.uploader_first_name })
                  }
                  title={item.caption}
                  fontClass={languageFontClass}
                  maxHeight={mediaMaxHeight}
                  onTitleCutChange={setIsTitleCut}
                />
              ) : null}
              <View className="gap-lg px-lg">
                {item.caption === null || !isTitleCut ? null : (
                  <Text
                    testID="gallery-full-title"
                    style={styles.caption}
                    className={`text-start text-lg text-neutral-900 ${languageFontClass}`}
                  >
                    {item.caption}
                  </Text>
                )}
                {/* The player's own controls cover the bottom of a video, so its
                  flag ends the line of who shared it, under the video (RAPP-892). */}
                <GalleryItemActions item={item} surface="page" onDeleted={back} />
              </View>
            </>
          )}
        </PageWidth>
      </ScrollView>
    </>
  );
}

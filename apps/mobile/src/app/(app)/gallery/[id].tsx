import {
  AnnouncementEmptyState,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { SelectionChoiceCard } from '@/components/auth/selection-choice-card';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ForumFlagButton } from '@/components/forum/forum-flag-button';
import { ForumFlagDialog } from '@/components/forum/forum-flag-dialog';
import { GalleryVideoStage } from '@/components/gallery/gallery-media-stage';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { PhotoHeroScreen } from '@/components/layout/photo-hero';
import { formatGalleryDate } from '@/lib/gallery-date';
import { playHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useDeleteGalleryItem, useGalleryItem, useSetGalleryPrivacy } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMarkGalleryItemSeen } from '@/lib/use-tab-news';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import type { ForumFlagInput } from '@ramassa/shared/forum';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import type { MediaPrivacy } from '@ramassa/shared/media';
import { buildMediaObjectUrl } from '@ramassa/shared/upload-client';

const MEDIA_PRIVACY_OPTIONS: readonly MediaPrivacy[] = ['community', 'staff_only'];
const styles = StyleSheet.create({
  caption: { writingDirection: 'auto' },
});

export default function GalleryItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back, push } = useRouter();
  const { t, i18n } = useTranslation(['gallery', 'forum']);
  const languageFontClass = useLanguageFontClass();
  const { user, role, session } = useAuth();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const query = useGalleryItem(id);
  const refetchItem = query.refetch;
  const privacyMutation = useSetGalleryPrivacy(id);
  const deleteMutation = useDeleteGalleryItem(id);
  const mutatePrivacy = privacyMutation.mutate;
  const deleteItem = deleteMutation.mutateAsync;
  const retryLoad = useCallback(() => void refetchItem(), [refetchItem]);
  const [flagTarget, setFlagTarget] = useState<Pick<
    ForumFlagInput,
    'targetType' | 'targetId'
  > | null>(null);
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
  useMarkGalleryItemSeen(item?.id);
  const accessToken = session?.access_token;
  const canManage =
    item !== undefined && (item.uploaded_by === user?.id || role === 'staff' || role === 'admin');
  const imageSource = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: item?.file_url ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, item?.file_url],
  );
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
  const privacyActions = useMemo<Record<MediaPrivacy, () => void>>(
    () => ({
      community: () => mutatePrivacy('community'),
      staff_only: () => mutatePrivacy('staff_only'),
    }),
    [mutatePrivacy],
  );
  const selectedPrivacy = item?.privacy_level;
  const renderPrivacyOption = useCallback(
    (value: MediaPrivacy) => (
      <SelectionChoiceCard
        key={value}
        label={t(`gallery:privacyLevels.${value}`)}
        fontClass={languageFontClass}
        isSelected={selectedPrivacy === value}
        onPress={privacyActions[value]}
      />
    ),
    [languageFontClass, privacyActions, selectedPrivacy, t],
  );
  // A tap on the photo opens it at full screen, over this screen (RAPP-913).
  const openPhoto = useCallback(
    () => push({ pathname: '/gallery/photo/[id]', params: { id } } as unknown as Href),
    [id, push],
  );
  const flagMedia = useCallback(() => {
    if (item !== undefined) setFlagTarget({ targetType: 'media', targetId: item.id });
  }, [item]);
  const closeFlagDialog = useCallback(() => setFlagTarget(null), []);
  const confirmFlag = useCallback(() => {
    setFlagTarget(null);
    Alert.alert(t('forum:flagConfirmationTitle'), t('forum:flagConfirmation'));
  }, [t]);
  const confirmDelete = useCallback(() => {
    Alert.alert(t('gallery:deleteTitle'), t('gallery:deleteBody'), [
      { text: t('gallery:cancel'), style: 'cancel' },
      {
        text: t('gallery:delete'),
        style: 'destructive',
        onPress: () => {
          playHaptic('warning');
          void deleteItem().then(() => back());
        },
      },
    ]);
  }, [back, deleteItem, t]);

  if (query.isPending && item === undefined && isOnline) {
    return (
      <>
        <NativeScreenHeader surface="white" />
        <AnnouncementFeedSkeleton accessibilityLabel={t('gallery:loading')} />
      </>
    );
  }

  const flagDialog = (
    <ForumFlagDialog target={flagTarget} onClose={closeFlagDialog} onConfirmed={confirmFlag} />
  );
  // Who shared it, with the report flag at the end of the line for anyone who
  // may report it (RAPP-892).
  const sharedByLine =
    item === undefined ? null : canManage ? (
      <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
        {t('gallery:mediaBy', { name: item.uploader_first_name })}
      </Text>
    ) : (
      <View className="flex-row items-center gap-sm">
        <Text className={`flex-1 text-start text-sm text-neutral-600 ${languageFontClass}`}>
          {t('gallery:mediaBy', { name: item.uploader_first_name })}
        </Text>
        <ForumFlagButton
          testID="gallery-flag"
          accessibilityLabel={t('gallery:flag')}
          onPress={flagMedia}
        />
      </View>
    );
  const ownerControls = canManage ? (
    <>
      <View
        testID="gallery-privacy-picker"
        accessibilityRole="radiogroup"
        accessibilityLabel={t('gallery:privacy')}
        className="gap-sm"
      >
        {MEDIA_PRIVACY_OPTIONS.map(renderPrivacyOption)}
      </View>
      <RaisedActionButton
        testID="gallery-delete"
        tone="danger"
        label={t('gallery:delete')}
        onPress={confirmDelete}
        isDisabled={deleteMutation.isPending}
      />
    </>
  ) : null;

  // A photo opens on the story layout (RAPP-915): the photo at the top, a tap
  // on it opens the lightbox, and its title and date are on the sheet under it.
  if (item !== undefined && item.file_type !== 'video' && imageSource !== null) {
    const photoLabel = item.caption ?? t('gallery:mediaBy', { name: item.uploader_first_name });
    return (
      <>
        <PhotoHeroScreen
          testID="gallery-detail-screen"
          source={imageSource}
          photoKey={item.file_url}
          accessibilityLabel={photoLabel}
          onOpenPhoto={openPhoto}
        >
          <PageWidth className="gap-lg">
            <View className="gap-xs">
              {item.caption === null ? null : (
                <Text
                  testID="gallery-full-title"
                  accessibilityRole="header"
                  style={styles.caption}
                  className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
                >
                  {item.caption}
                </Text>
              )}
              <Text
                testID="gallery-detail-date"
                className={`text-start text-sm text-neutral-600 ${languageFontClass}`}
              >
                {formatGalleryDate(item.created_at, i18n.resolvedLanguage ?? DEFAULT_LANGUAGE)}
              </Text>
            </View>
            {sharedByLine}
            {ownerControls}
          </PageWidth>
        </PhotoHeroScreen>
        {flagDialog}
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
                {/* The player's own controls cover the bottom of a video, so its
                  flag ends the line of who shared it, under the video (RAPP-892). */}
                {sharedByLine}
                {item.caption === null || !isTitleCut ? null : (
                  <Text
                    testID="gallery-full-title"
                    style={styles.caption}
                    className={`text-start text-lg text-neutral-900 ${languageFontClass}`}
                  >
                    {item.caption}
                  </Text>
                )}
                {ownerControls}
              </View>
            </>
          )}
        </PageWidth>
        {flagDialog}
      </ScrollView>
    </>
  );
}

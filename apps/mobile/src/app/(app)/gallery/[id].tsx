import {
  AnnouncementEmptyState,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { SelectionChoiceCard } from '@/components/auth/selection-choice-card';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ForumFlagButton } from '@/components/forum/forum-flag-button';
import { ForumFlagDialog } from '@/components/forum/forum-flag-dialog';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { containedPictureCornerOffsets } from '@/lib/contained-picture-corner';
import { playHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useDeleteGalleryItem, useGalleryItem, useSetGalleryPrivacy } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image, type ImageLoadEventData } from 'expo-image';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import type { ForumFlagInput } from '@ramassa/shared/forum';
import type { MediaPrivacy } from '@ramassa/shared/media';
import { tokens } from '@ramassa/shared/tokens';
import { buildMediaObjectUrl } from '@ramassa/shared/upload-client';

const GALLERY_MEDIA_ASPECT_RATIO = 4 / 3;
// The report flag sits on the photo, this far in from its bottom-end corner, so
// its whole raised edge stays inside the picture (RAPP-892).
const FLAG_INSET_ON_PICTURE = tokens.spacing.sm;
const MEDIA_PRIVACY_OPTIONS: readonly MediaPrivacy[] = ['community', 'staff_only'];
const styles = StyleSheet.create({
  media: {
    width: '100%',
    aspectRatio: GALLERY_MEDIA_ASPECT_RATIO,
    backgroundColor: tokens.colors.neutral[900],
  },
  caption: { writingDirection: 'auto' },
});

/** The flag's place on the photo, once the frame's width and the photo's shape are known. */
function flagOnPictureStyle(
  frameWidth: number | null,
  pictureAspectRatio: number | null,
): ViewStyle | null {
  if (frameWidth === null || pictureAspectRatio === null) return null;
  const { end, bottom } = containedPictureCornerOffsets({
    frameWidth,
    frameAspectRatio: GALLERY_MEDIA_ASPECT_RATIO,
    pictureAspectRatio,
    inset: FLAG_INSET_ON_PICTURE,
  });
  return { position: 'absolute', end, bottom };
}

export default function GalleryItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation(['gallery', 'forum']);
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
  // The photo is contained in a fixed frame, so the flag waits for the frame's
  // width and the photo's own shape to find the photo's corner. A photo that
  // fails to load is taken as filling the frame.
  const [mediaFrameWidth, setMediaFrameWidth] = useState<number | null>(null);
  const [pictureAspectRatio, setPictureAspectRatio] = useState<number | null>(null);
  const measureMediaFrame = useCallback(
    (event: LayoutChangeEvent) => setMediaFrameWidth(event.nativeEvent.layout.width),
    [],
  );
  const recordPictureShape = useCallback(({ source }: ImageLoadEventData) => {
    if (source.width > 0 && source.height > 0) setPictureAspectRatio(source.width / source.height);
  }, []);
  const fillFrameOnPictureError = useCallback(
    () => setPictureAspectRatio(GALLERY_MEDIA_ASPECT_RATIO),
    [],
  );
  const flagOnPicture = useMemo(
    () => flagOnPictureStyle(mediaFrameWidth, pictureAspectRatio),
    [mediaFrameWidth, pictureAspectRatio],
  );
  const item = query.data;
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
  const videoPlayer = useVideoPlayer(videoSource);
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

  return (
    <>
      <NativeScreenHeader surface="white" />
      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="grow px-lg py-lg"
        contentInsetAdjustmentBehavior="automatic"
      >
        <PageWidth className="gap-lg">
          {item === undefined && !isOnline ? (
            <AnnouncementEmptyState
              title={t('gallery:offlineEmptyTitle')}
              body={t('gallery:offlineEmptyBody')}
              languageFontClass={languageFontClass}
            />
          ) : item === undefined ? (
            <View testID="gallery-detail-load-error" className="gap-md py-xl">
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
            <View className="gap-lg">
              {isPlayableVideo ? (
                <VideoView
                  player={videoPlayer}
                  nativeControls
                  accessibilityLabel={
                    item.caption ?? t('gallery:mediaBy', { name: item.uploader_first_name })
                  }
                  contentFit="contain"
                  style={styles.media}
                />
              ) : imageSource === null ? null : (
                <View onLayout={measureMediaFrame}>
                  <Image
                    source={imageSource}
                    accessibilityLabel={
                      item.caption ?? t('gallery:mediaBy', { name: item.uploader_first_name })
                    }
                    cachePolicy="memory-disk"
                    contentFit="contain"
                    style={styles.media}
                    onLoad={recordPictureShape}
                    onError={fillFrameOnPictureError}
                  />
                  {canManage || flagOnPicture === null ? null : (
                    <View style={flagOnPicture}>
                      <ForumFlagButton
                        testID="gallery-flag"
                        accessibilityLabel={t('gallery:flag')}
                        onPress={flagMedia}
                      />
                    </View>
                  )}
                </View>
              )}
              {/* The player's own controls cover the bottom of a video, so its
                  flag ends the line of who shared it, under the video (RAPP-892). */}
              {isPlayableVideo && !canManage ? (
                <View className="flex-row items-center gap-sm">
                  <Text
                    className={`flex-1 text-start text-sm text-neutral-600 ${languageFontClass}`}
                  >
                    {t('gallery:mediaBy', { name: item.uploader_first_name })}
                  </Text>
                  <ForumFlagButton
                    testID="gallery-flag"
                    accessibilityLabel={t('gallery:flag')}
                    onPress={flagMedia}
                  />
                </View>
              ) : (
                <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                  {t('gallery:mediaBy', { name: item.uploader_first_name })}
                </Text>
              )}
              {item.caption === null ? null : (
                <Text
                  style={styles.caption}
                  className={`text-start text-lg text-neutral-900 ${languageFontClass}`}
                >
                  {item.caption}
                </Text>
              )}
              {canManage ? (
                <View
                  testID="gallery-privacy-picker"
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('gallery:privacy')}
                  className="gap-sm"
                >
                  {MEDIA_PRIVACY_OPTIONS.map(renderPrivacyOption)}
                </View>
              ) : null}
              {canManage ? (
                <RaisedActionButton
                  testID="gallery-delete"
                  tone="danger"
                  label={t('gallery:delete')}
                  onPress={confirmDelete}
                  isDisabled={deleteMutation.isPending}
                />
              ) : null}
            </View>
          )}
        </PageWidth>
        <ForumFlagDialog target={flagTarget} onClose={closeFlagDialog} onConfirmed={confirmFlag} />
      </ScrollView>
    </>
  );
}

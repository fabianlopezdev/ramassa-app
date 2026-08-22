import {
  AnnouncementEmptyState,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { ErrorCodeLine } from '@/components/error-code-line';
import { ForumFlagDialog } from '@/components/forum/forum-flag-dialog';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useDeleteGalleryItem, useGalleryItem, useSetGalleryPrivacy } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import type { ForumFlagInput } from '@ramassa/shared/forum';
import type { MediaPrivacy } from '@ramassa/shared/media';
import { tokens } from '@ramassa/shared/tokens';
import { buildMediaObjectUrl } from '@ramassa/shared/upload-client';

const GALLERY_MEDIA_ASPECT_RATIO = 4 / 3;
const MEDIA_PRIVACY_OPTIONS: readonly MediaPrivacy[] = ['community', 'staff_only'];
const styles = StyleSheet.create({
  media: {
    width: '100%',
    aspectRatio: GALLERY_MEDIA_ASPECT_RATIO,
    backgroundColor: tokens.colors.neutral[900],
  },
  caption: { writingDirection: 'auto' },
});

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
  const item = query.data;
  const loadErrorCode = query.error === null ? 'DB-1' : toAppError(query.error).code;
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
      <PressableScale
        key={value}
        accessibilityRole="radio"
        accessibilityLabel={t(`gallery:privacyLevels.${value}`)}
        isSelected={selectedPrivacy === value}
        onPress={privacyActions[value]}
        haptic="selection"
        style={continuousCorners}
        className={`min-h-recommended justify-center rounded-md border px-lg ${selectedPrivacy === value ? 'border-primary bg-primary' : 'border-neutral-300'}`}
      >
        <Text
          className={`${selectedPrivacy === value ? 'text-white' : 'text-neutral-800'} ${languageFontClass}`}
        >
          {t(`gallery:privacyLevels.${value}`)}
        </Text>
      </PressableScale>
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
          void deleteItem().then(back);
        },
      },
    ]);
  }, [back, deleteItem, t]);

  if (query.isPending && item === undefined && isOnline) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('gallery:loading')} />;
  }

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="grow px-lg py-lg"
      contentInsetAdjustmentBehavior="automatic"
    >
      <PageWidth className="gap-lg">
        <PressableScale
          testID="gallery-detail-back"
          accessibilityLabel={t('gallery:back')}
          onPress={back}
          haptic="tapLight"
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`font-medium text-primary ${languageFontClass}`}>
            {t('gallery:back')}
          </Text>
        </PressableScale>
        {!isOnline ? (
          <OfflineBanner label={t('gallery:offline')} languageFontClass={languageFontClass} />
        ) : null}
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
            <ErrorCodeLine code={loadErrorCode} />
            <PressableScale
              testID="gallery-detail-retry"
              accessibilityLabel={t('gallery:retry')}
              onPress={retryLoad}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-lg font-bold text-white ${languageFontClass}`}>
                {t('gallery:retry')}
              </Text>
            </PressableScale>
          </View>
        ) : (
          <View className="gap-lg">
            {item.file_type === 'video' && videoUri !== null && accessToken !== undefined ? (
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
              <Image
                source={imageSource}
                accessibilityLabel={
                  item.caption ?? t('gallery:mediaBy', { name: item.uploader_first_name })
                }
                cachePolicy="memory-disk"
                contentFit="contain"
                style={styles.media}
              />
            )}
            <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
              {t('gallery:mediaBy', { name: item.uploader_first_name })}
            </Text>
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
              <PressableScale
                testID="gallery-delete"
                accessibilityLabel={t('gallery:delete')}
                onPress={confirmDelete}
                haptic="warning"
                isBusy={deleteMutation.isPending}
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-error px-lg"
              >
                <Text className={`font-bold text-error ${languageFontClass}`}>
                  {t('gallery:delete')}
                </Text>
              </PressableScale>
            ) : (
              <PressableScale
                testID="gallery-flag"
                accessibilityLabel={t('gallery:flag')}
                onPress={flagMedia}
                haptic="warning"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
              >
                <Text className={`font-bold text-neutral-700 ${languageFontClass}`}>
                  {t('gallery:flag')}
                </Text>
              </PressableScale>
            )}
          </View>
        )}
      </PageWidth>
      <ForumFlagDialog target={flagTarget} onClose={closeFlagDialog} onConfirmed={confirmFlag} />
    </ScrollView>
  );
}

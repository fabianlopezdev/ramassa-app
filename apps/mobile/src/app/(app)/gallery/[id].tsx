import { ForumFlagDialog } from '@/components/forum/forum-flag-dialog';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { resolveMediaImageSource } from '@/lib/media-source';
import { useDeleteGalleryItem, useGalleryItem, useSetGalleryPrivacy } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import type { ForumFlagInput } from '@ramassa/shared/forum';
import type { MediaPrivacy } from '@ramassa/shared/media';
import { tokens } from '@ramassa/shared/tokens';
import { buildMediaObjectUrl } from '@ramassa/shared/upload-client';

const styles = StyleSheet.create({
  media: { width: '100%', aspectRatio: 4 / 3, backgroundColor: tokens.colors.neutral[900] },
});

function GalleryVideo({ uri, token }: { readonly uri: string; readonly token: string }) {
  const source = useMemo(
    () => ({ uri, headers: { authorization: `Bearer ${token}` } }),
    [token, uri],
  );
  const player = useVideoPlayer(source);
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.media} />;
}

export default function GalleryItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation(['gallery', 'forum']);
  const languageFontClass = useLanguageFontClass();
  const { user, role, session } = useAuth();
  const query = useGalleryItem(id);
  const privacyMutation = useSetGalleryPrivacy(id);
  const deleteMutation = useDeleteGalleryItem(id);
  const [flagTarget, setFlagTarget] = useState<Pick<
    ForumFlagInput,
    'targetType' | 'targetId'
  > | null>(null);
  const item = query.data;
  const canManage =
    item !== undefined && (item.uploaded_by === user?.id || role === 'staff' || role === 'admin');
  const imageSource = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: item?.file_url ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken: session?.access_token,
      }),
    [item?.file_url, session?.access_token],
  );
  const videoUri =
    item?.file_type === 'video' && mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL !== undefined
      ? buildMediaObjectUrl(mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL, item.file_url)
      : null;
  const setPrivacy = useCallback(
    (value: MediaPrivacy) => void privacyMutation.mutateAsync(value),
    [privacyMutation],
  );
  const confirmDelete = useCallback(() => {
    Alert.alert(t('gallery:deleteTitle'), t('gallery:deleteBody'), [
      { text: t('gallery:cancel'), style: 'cancel' },
      {
        text: t('gallery:delete'),
        style: 'destructive',
        onPress: () => void deleteMutation.mutateAsync().then(back),
      },
    ]);
  }, [back, deleteMutation, t]);

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="grow px-lg py-lg">
      <PageWidth className="gap-lg">
        <PressableScale
          accessibilityLabel={t('gallery:back')}
          onPress={back}
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`font-medium text-primary ${languageFontClass}`}>
            {t('gallery:back')}
          </Text>
        </PressableScale>
        {item === undefined ? (
          <Text className={`text-center text-neutral-600 ${languageFontClass}`}>
            {t(query.isPending ? 'gallery:loading' : 'gallery:loadFailed')}
          </Text>
        ) : (
          <View className="gap-lg">
            {item.file_type === 'video' && videoUri !== null && session !== null ? (
              <GalleryVideo uri={videoUri} token={session.access_token} />
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
              <Text className={`text-start text-lg text-neutral-900 ${languageFontClass}`}>
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
                {(['community', 'staff_only'] as const).map((value) => (
                  <PressableScale
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={t(`gallery:privacyLevels.${value}`)}
                    isSelected={item.privacy_level === value}
                    onPress={() => setPrivacy(value)}
                    className={`min-h-recommended justify-center rounded-md border px-lg ${item.privacy_level === value ? 'border-primary bg-primary' : 'border-neutral-300'}`}
                  >
                    <Text
                      className={`${item.privacy_level === value ? 'text-white' : 'text-neutral-800'} ${languageFontClass}`}
                    >
                      {t(`gallery:privacyLevels.${value}`)}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            ) : null}
            {canManage ? (
              <PressableScale
                testID="gallery-delete"
                accessibilityLabel={t('gallery:delete')}
                onPress={confirmDelete}
                isBusy={deleteMutation.isPending}
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
                onPress={() => setFlagTarget({ targetType: 'media', targetId: item.id })}
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
      <ForumFlagDialog
        target={flagTarget}
        onClose={() => setFlagTarget(null)}
        onConfirmed={() => {
          setFlagTarget(null);
          Alert.alert(t('forum:flagConfirmationTitle'), t('forum:flagConfirmation'));
        }}
      />
    </ScrollView>
  );
}

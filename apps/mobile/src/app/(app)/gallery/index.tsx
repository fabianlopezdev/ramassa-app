import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { resolveMediaImageSource } from '@/lib/media-source';
import { useGalleryItems } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import type { MediaItemRow } from '@ramassa/shared/media';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  content: { padding: tokens.spacing.md, paddingBottom: tokens.spacing['3xl'] },
  tile: { width: '100%', aspectRatio: 1 },
});
const keyExtractor = (item: MediaItemRow) => item.id;

export default function GalleryScreen() {
  const { t } = useTranslation('gallery');
  const languageFontClass = useLanguageFontClass();
  const { push, back } = useRouter();
  const { session } = useAuth();
  const query = useGalleryItems();
  const openItem = useCallback(
    (id: string) => push({ pathname: '/gallery/[id]', params: { id } } as unknown as Href),
    [push],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MediaItemRow>) => {
      const source = resolveMediaImageSource({
        objectKeyOrUrl: item.thumbnail_url ?? item.file_url,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken: session?.access_token,
      });
      return (
        <View className="p-xs">
          <PressableScale
            testID={`gallery-item-${item.id}`}
            accessibilityLabel={t('openItem', { name: item.uploader_first_name })}
            onPress={() => openItem(item.id)}
            className="overflow-hidden rounded-md bg-neutral-200"
          >
            {source === null ? null : (
              <Image
                recyclingKey={item.id}
                source={source}
                accessibilityLabel={
                  item.caption ?? t('mediaBy', { name: item.uploader_first_name })
                }
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={150}
                style={styles.tile}
              />
            )}
          </PressableScale>
        </View>
      );
    },
    [openItem, session?.access_token, t],
  );
  const header = useMemo(
    () => (
      <PageWidth className="gap-md pb-lg">
        <PressableScale
          accessibilityLabel={t('back')}
          onPress={back}
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
        <PressableScale
          testID="gallery-upload"
          accessibilityLabel={t('upload')}
          onPress={() => push('/gallery/upload' as Href)}
          haptic="tapLight"
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`font-bold text-white ${languageFontClass}`}>{t('upload')}</Text>
        </PressableScale>
      </PageWidth>
    ),
    [back, languageFontClass, push, t],
  );

  return (
    <FlashList
      testID="gallery-grid"
      accessibilityRole="list"
      data={query.data ?? []}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={2}
      style={styles.screen}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <Text className={`text-center text-neutral-600 ${languageFontClass}`}>
          {t(query.isPending ? 'loading' : 'empty')}
        </Text>
      }
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    />
  );
}

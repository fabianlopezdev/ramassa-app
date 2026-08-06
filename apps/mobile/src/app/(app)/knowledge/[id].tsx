import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { PlayerStructuredContent } from '@/components/knowledge/player-structured-content';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePlayerKnowledgeArticle } from '@/lib/player-knowledge';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { resolveLocalizedKnowledgeBlocks } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  cover: { width: '100%', height: tokens.contentWidth.form / 2, borderRadius: tokens.radius.lg },
  storyImage: {
    width: '100%',
    height: tokens.contentWidth.form / 2,
    borderRadius: tokens.radius.md,
  },
});

export default function PlayerKnowledgeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation(['knowledge', 'common']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { session } = useAuth();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const query = usePlayerKnowledgeArticle(id);
  const article = query.data;
  const title = article === undefined ? undefined : resolveLocalizedText(article.title, language);
  const category =
    article === undefined ? undefined : resolveLocalizedText(article.category.name, language);
  const body =
    article === undefined ? undefined : resolveLocalizedKnowledgeBlocks(article.body, language);
  const coverSource = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: article?.image_url ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken: session?.access_token,
      }),
    [article?.image_url, session?.access_token],
  );
  const storyImageSources = useMemo(
    () =>
      (article?.story_image_urls ?? []).flatMap((objectKey) => {
        const source = resolveMediaImageSource({
          objectKeyOrUrl: objectKey,
          mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
          accessToken: session?.access_token,
        });
        return source === null ? [] : [source];
      }),
    [article?.story_image_urls, session?.access_token],
  );
  const openExternalResource = useCallback(() => {
    if (article?.external_url !== null && article?.external_url !== undefined) {
      void WebBrowser.openBrowserAsync(article.external_url);
    }
  }, [article?.external_url]);
  const retry = useCallback(() => void query.refetch(), [query]);
  const insets = useSafeAreaInsets();
  const androidEdgeInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: insets.top + tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom, insets.top],
  );

  if (query.isPending && article === undefined) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('knowledge:playerLoading')} />;
  }
  if (query.isError && article === undefined) {
    return (
      <AnnouncementFeedError
        message={t('knowledge:playerLoadFailed')}
        retryLabel={t('knowledge:playerRetry')}
        code={toAppError(query.error).code}
        languageFontClass={languageFontClass}
        onRetry={retry}
      />
    );
  }

  return (
    <ScrollView
      testID="knowledge-detail-screen"
      className="flex-1 bg-white"
      contentContainerClassName="grow px-lg py-lg"
      contentContainerStyle={androidEdgeInsets}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PageWidth className="gap-lg">
        <PressableScale
          accessibilityLabel={t('knowledge:backToResources')}
          onPress={() => router.back()}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
            {t('knowledge:backToResources')}
          </Text>
        </PressableScale>
        {isOffline ? (
          <OfflineBanner
            label={t('knowledge:playerOffline')}
            languageFontClass={languageFontClass}
          />
        ) : null}
        {article === undefined ||
        title === undefined ||
        category === undefined ||
        body === undefined ? (
          <View className="items-center gap-md py-3xl">
            <Text
              accessibilityRole="header"
              className={`text-center text-xl font-bold ${languageFontClass}`}
            >
              {t('knowledge:playerEmptyTitle')}
            </Text>
            <Text className={`text-center text-md text-neutral-600 ${languageFontClass}`}>
              {t('knowledge:playerEmptyBody')}
            </Text>
          </View>
        ) : (
          <View className="gap-lg">
            <View className="gap-sm">
              <Text
                className={`text-start text-sm font-semibold text-primary-dark ${languageFontClass}`}
              >
                {category.text}
              </Text>
              <Text
                accessibilityRole="header"
                className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {title.text}
              </Text>
              {article.author_first_name === null ? null : (
                <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                  {t('knowledge:byAuthor', { name: article.author_first_name })}
                </Text>
              )}
            </View>
            {coverSource === null ? null : (
              <Image
                source={coverSource}
                accessibilityLabel={title.text}
                cachePolicy="memory-disk"
                contentFit="cover"
                style={styles.cover}
              />
            )}
            <PlayerStructuredContent
              blocks={body.blocks}
              videoUrl={article.video_url}
              title={title.text}
              accessToken={session?.access_token}
              unavailableLabel={t('knowledge:contentUnavailable')}
            />
            {storyImageSources.map((source, index) => (
              <Image
                key={article.story_image_urls[index]}
                source={source}
                accessibilityLabel={t('knowledge:storyPhoto', {
                  number: index + 1,
                  title: title.text,
                })}
                cachePolicy="memory-disk"
                contentFit="cover"
                style={styles.storyImage}
              />
            ))}
            {article.external_url === null ? null : (
              <PressableScale
                accessibilityLabel={t('knowledge:openExternalResource')}
                onPress={openExternalResource}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
              >
                <Text className={`text-md font-bold text-white ${languageFontClass}`}>
                  {t('knowledge:openExternalResource')}
                </Text>
              </PressableScale>
            )}
          </View>
        )}
      </PageWidth>
    </ScrollView>
  );
}

import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { KnowledgeArticle } from '@/components/knowledge/knowledge-article';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePlayerKnowledgeArticle } from '@/lib/player-knowledge';
import { useStaffCards } from '@/lib/staff-cards';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { resolveLocalizedKnowledgeBlocks } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

export default function PlayerKnowledgeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation(['knowledge', 'common']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { session } = useAuth();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const query = usePlayerKnowledgeArticle(id);
  const article = query.data;
  // A team article names its author with her photo; a story keeps the
  // player's first name with her initial (RAPP-639).
  const staffAuthorIds = useMemo(
    () => [article?.content_type === 'participant_story' ? null : article?.created_by],
    [article?.content_type, article?.created_by],
  );
  const staffCards = useStaffCards(staffAuthorIds);
  const staffAuthor =
    article?.created_by === null || article?.created_by === undefined
      ? undefined
      : staffCards.get(article.created_by);
  const title = article === undefined ? undefined : resolveLocalizedText(article.title, language);
  const category =
    article === undefined ? undefined : resolveLocalizedText(article.category.name, language);
  const body =
    article === undefined ? undefined : resolveLocalizedKnowledgeBlocks(article.body, language);
  const openExternalResource = useCallback(() => {
    if (article?.external_url !== null && article?.external_url !== undefined) {
      void WebBrowser.openBrowserAsync(article.external_url);
    }
  }, [article?.external_url]);
  const { refetch } = query;
  const retry = useCallback(() => void refetch(), [refetch]);
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
          testID="knowledge-detail-back"
          accessibilityLabel={t('knowledge:backToResources')}
          onPress={back}
          haptic="tapLight"
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
          <KnowledgeArticle
            article={{
              title: article.title,
              categoryName: article.category.name,
              authorFirstName: article.author_first_name ?? staffAuthor?.firstName ?? null,
              authorAvatarKey: staffAuthor?.avatarKey ?? null,
              body: article.body,
              imageUrl: article.image_url,
              videoUrl: article.video_url,
              externalUrl: article.external_url,
              storyImageUrls: article.story_image_urls,
            }}
            accessToken={session?.access_token}
            onOpenExternal={openExternalResource}
          />
        )}
      </PageWidth>
    </ScrollView>
  );
}

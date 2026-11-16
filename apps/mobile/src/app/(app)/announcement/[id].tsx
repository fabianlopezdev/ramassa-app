import { AnnouncementArticle } from '@/components/announcements/announcement-article';
import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { usePlayerAnnouncements } from '@/lib/announcement-feed';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

export default function AnnouncementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { t } = useTranslation(['home', 'common']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const query = usePlayerAnnouncements();
  const { data, refetch } = query;
  const retry = useCallback(() => void refetch(), [refetch]);
  const announcement = data?.find((row) => row.id === id);
  const title =
    announcement === undefined ? undefined : resolveLocalizedText(announcement.title, language);
  const body =
    announcement === undefined ? undefined : resolveLocalizedText(announcement.body, language);
  const imageSource = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: announcement?.image_url ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken: session?.access_token,
      }),
    [announcement?.image_url, session?.access_token],
  );
  const insets = useSafeAreaInsets();
  const androidEdgeInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom],
  );

  if (query.isPending && data === undefined) {
    return (
      <>
        <NativeScreenHeader />
        <AnnouncementFeedSkeleton accessibilityLabel={t('loading')} />
      </>
    );
  }

  if (query.isError && data === undefined) {
    return (
      <>
        <NativeScreenHeader />
        <AnnouncementFeedError
          message={t('loadFailed')}
          retryLabel={t('retryAction')}
          code={toAppError(query.error).code}
          languageFontClass={languageFontClass}
          onRetry={retry}
        />
      </>
    );
  }

  return (
    <>
      <NativeScreenHeader />
      <ScrollView
        testID="announcement-detail-screen"
        className="flex-1 bg-white"
        contentContainerClassName="grow px-lg py-lg"
        contentContainerStyle={androidEdgeInsets}
        contentInsetAdjustmentBehavior="automatic"
      >
        <PageWidth className="gap-lg">
          {announcement === undefined || title === undefined || body === undefined ? (
            <View className="flex-1 items-center justify-center gap-md py-3xl">
              <Text
                accessibilityRole="header"
                className={`text-center text-xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('emptyTitle')}
              </Text>
              <Text className={`text-center text-md text-neutral-600 ${languageFontClass}`}>
                {t('emptyBody')}
              </Text>
            </View>
          ) : (
            <AnnouncementArticle
              announcement={{
                category: announcement.category,
                isPinned: announcement.is_pinned,
                title: announcement.title,
                body: announcement.body,
                imageAlt: announcement.image_alt,
                shownAt: announcement.published_at ?? announcement.created_at,
              }}
              imageSource={imageSource}
            />
          )}
        </PageWidth>
      </ScrollView>
    </>
  );
}

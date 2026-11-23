import {
  AnnouncementArticle,
  type AnnouncementArticleContent,
} from '@/components/announcements/announcement-article';
import { useAnnouncementWash } from '@/components/announcements/category-filters';
import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { PhotoHeroScreen } from '@/components/layout/photo-hero';
import { usePlayerAnnouncements } from '@/lib/announcement-feed';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useMarkAnnouncementSeen } from '@/lib/use-home-attention';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AnnouncementListRow } from '@ramassa/shared/announcements';
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
  useMarkAnnouncementSeen(announcement?.id);
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
  // An open avís sits on the wash of its kind, the shade of its card on Inici
  // (RAPP-893). While it loads or is missing, the screen stays white.
  const wash = useAnnouncementWash(announcement?.category);
  const washStyle = useMemo(
    () => (wash === undefined ? undefined : { backgroundColor: wash }),
    [wash],
  );

  if (query.isPending && data === undefined) {
    return (
      <>
        <NativeScreenHeader surface="white" />
        <AnnouncementFeedSkeleton accessibilityLabel={t('loading')} />
      </>
    );
  }

  if (query.isError && data === undefined) {
    return (
      <>
        <NativeScreenHeader surface="white" />
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

  const hasArticle = announcement !== undefined && title !== undefined && body !== undefined;
  // An avís with a photo opens on it, its text on a sheet in the wash of its
  // kind, and the text no longer repeats the photo (RAPP-915).
  if (hasArticle && imageSource !== null) {
    return (
      <PhotoHeroScreen
        testID="announcement-detail-screen"
        source={imageSource}
        photoKey={announcement.image_url ?? announcement.id}
        accessibilityLabel={
          (announcement.image_alt === null
            ? undefined
            : resolveLocalizedText(announcement.image_alt, language)?.text) ?? title.text
        }
        sheetColor={wash}
      >
        <PageWidth className="gap-lg">
          <AnnouncementArticle
            announcement={announcementArticleContent(announcement)}
            imageSource={null}
          />
        </PageWidth>
      </PhotoHeroScreen>
    );
  }

  return (
    <>
      <NativeScreenHeader surface="white" backgroundColor={wash} />
      <ScrollView
        testID="announcement-detail-screen"
        className={wash === undefined ? 'flex-1 bg-white' : 'flex-1'}
        style={washStyle}
        contentContainerClassName="grow px-lg py-lg"
        contentContainerStyle={androidEdgeInsets}
        contentInsetAdjustmentBehavior="automatic"
      >
        <PageWidth className="gap-lg">
          {hasArticle ? (
            <AnnouncementArticle
              announcement={announcementArticleContent(announcement)}
              imageSource={imageSource}
            />
          ) : (
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
          )}
        </PageWidth>
      </ScrollView>
    </>
  );
}

function announcementArticleContent(announcement: AnnouncementListRow): AnnouncementArticleContent {
  return {
    category: announcement.category,
    isPinned: announcement.is_pinned,
    title: announcement.title,
    body: announcement.body,
    imageAlt: announcement.image_alt,
    shownAt: announcement.published_at ?? announcement.created_at,
  };
}

import { AnnouncementCard } from '@/components/announcements/announcement-card';
import {
  announcementCategoryLabel,
  CategoryFilters,
} from '@/components/announcements/category-filters';
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { usePlayerAnnouncements } from '@/lib/announcement-feed';
import { isNetworkStateOnline } from '@/lib/network-status';
import { logger } from '@/lib/observability';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  filterAndOrderPlayerAnnouncements,
  type AnnouncementListRow,
  type PlayerAnnouncementCategoryFilter,
} from '@ramassa/shared/announcements';
import { toAppError } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_ANNOUNCEMENTS: readonly AnnouncementListRow[] = [];

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: tokens.colors.white },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing['3xl'],
  },
});

const keyExtractor = (item: AnnouncementListRow) => item.id;
const getItemType = (item: AnnouncementListRow) =>
  item.image_url === null ? 'text-announcement' : 'image-announcement';

export default function HomeScreen() {
  const { t, i18n } = useTranslation(['home', 'common']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const [category, setCategory] = useState<PlayerAnnouncementCategoryFilter>('all');
  const { data, isPending, isError, error, isRefetching, refetch } = usePlayerAnnouncements();

  const announcements = useMemo(
    () => filterAndOrderPlayerAnnouncements(data ?? EMPTY_ANNOUNCEMENTS, category),
    [category, data],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        day: 'numeric',
        month: 'long',
      }),
    [i18n.resolvedLanguage],
  );

  const openAnnouncement = useCallback(
    (id: string) => router.push(`/announcement/${id}` as Href),
    [router],
  );

  const renderAnnouncement = useCallback(
    ({ item }: ListRenderItemInfo<AnnouncementListRow>) => {
      const title = resolveLocalizedText(item.title, language);
      const body = resolveLocalizedText(item.body, language);
      if (title === undefined || body === undefined) return null;
      const imageAlt =
        item.image_alt === null ? undefined : resolveLocalizedText(item.image_alt, language);
      const categoryLabel = announcementCategoryLabel(item.category, t);
      const publishedDate = dateFormatter.format(new Date(item.published_at ?? item.created_at));
      const completeLabel = [
        categoryLabel,
        item.is_pinned ? t('pinned') : null,
        title.text,
        body.text,
        imageAlt?.text ?? null,
        publishedDate,
      ]
        .filter((part): part is string => typeof part === 'string')
        .join('. ');

      return (
        <PageWidth className="pb-md">
          <AnnouncementCard
            id={item.id}
            title={title.text}
            body={body.text}
            category={categoryLabel}
            publishedDate={publishedDate}
            imageUrl={item.image_url}
            imageAlt={imageAlt?.text ?? null}
            isPinned={item.is_pinned}
            pinnedLabel={t('pinned')}
            accessibilityLabel={completeLabel}
            languageFontClass={languageFontClass}
            onOpen={openAnnouncement}
          />
        </PageWidth>
      );
    },
    [dateFormatter, language, languageFontClass, openAnnouncement, t],
  );

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onListLoad = useCallback(
    ({ elapsedTimeInMs }: { readonly elapsedTimeInMs: number }) => {
      logger.info('announcement feed rendered', {
        elapsedTimeInMs: Math.round(elapsedTimeInMs),
        itemCount: announcements.length,
      });
    },
    [announcements.length],
  );

  const insets = useSafeAreaInsets();
  const contentContainerStyle = useMemo(
    () => [
      styles.content,
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: insets.top + tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing['3xl'],
          }
        : { paddingTop: tokens.spacing.lg },
    ],
    [insets.bottom, insets.top],
  );

  if (isPending && data === undefined) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('loading')} />;
  }

  if (isError && data === undefined) {
    return (
      <AnnouncementFeedError
        message={t('loadFailed')}
        retryLabel={t('retryAction')}
        code={toAppError(error).code}
        languageFontClass={languageFontClass}
        onRetry={onRefresh}
      />
    );
  }

  return (
    <FlashList
      data={announcements}
      renderItem={renderAnnouncement}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      extraData={category}
      style={styles.list}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={isRefetching && !isOffline}
      onRefresh={onRefresh}
      onLoad={onListLoad}
      ListHeaderComponent={
        <PageWidth className="gap-lg pb-lg">
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('feedTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('feedIntro')}
            </Text>
          </View>
          {isOffline ? (
            <OfflineBanner label={t('offlineBanner')} languageFontClass={languageFontClass} />
          ) : null}
          <CategoryFilters
            selected={category}
            onSelect={setCategory}
            t={t}
            languageFontClass={languageFontClass}
          />
        </PageWidth>
      }
      ListEmptyComponent={
        <PageWidth>
          <AnnouncementEmptyState
            title={t('emptyTitle')}
            body={t('emptyBody')}
            languageFontClass={languageFontClass}
          />
        </PageWidth>
      }
    />
  );
}

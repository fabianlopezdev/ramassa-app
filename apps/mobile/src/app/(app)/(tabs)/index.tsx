import {
  AnnouncementCard,
  PinnedAnnouncementCard,
  type AnnouncementCardProps,
} from '@/components/announcements/announcement-card';
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
import { HomeNextActivity } from '@/components/home/home-next-activity';
import { HomeSectionHeader } from '@/components/home/home-section-header';
import { HomeToDo } from '@/components/home/home-to-do';
import { PageWidth } from '@/components/layout/content-width';
import { PlayerTabHeader, PlayerTabStateFrame } from '@/components/profile/player-tab-header';
import { usePlayerAnnouncements } from '@/lib/announcement-feed';
import { useMyCustomForms } from '@/lib/custom-forms';
import { pickNextPlayerActivity } from '@/lib/home-next-activity';
import { buildHomeToDoQueue } from '@/lib/home-to-do';
import { isNetworkStateOnline } from '@/lib/network-status';
import { logger } from '@/lib/observability';
import { usePlayerEvents } from '@/lib/player-events';
import { usePlayerSurveys } from '@/lib/player-surveys';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  filterAndOrderPlayerAnnouncements,
  type AnnouncementListRow,
  type PlayerAnnouncementCategoryFilter,
} from '@ramassa/shared/announcements';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE, resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
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
  const { t, i18n } = useTranslation(['home', 'common', 'nav']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { session } = useAuth();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const [category, setCategory] = useState<PlayerAnnouncementCategoryFilter>('all');
  const { data, isPending, isError, error, isRefetching, refetch } = usePlayerAnnouncements();
  const formsQuery = useMyCustomForms(true);
  const surveysQuery = usePlayerSurveys();
  const eventsQuery = usePlayerEvents();
  const refetchForms = formsQuery.refetch;
  const refetchSurveys = surveysQuery.refetch;
  const refetchEvents = eventsQuery.refetch;

  const toDoItems = useMemo(
    () => buildHomeToDoQueue(formsQuery.data, surveysQuery.data),
    [formsQuery.data, surveysQuery.data],
  );
  const nextActivity = useMemo(() => pickNextPlayerActivity(eventsQuery.data), [eventsQuery.data]);

  const announcements = useMemo(
    () => filterAndOrderPlayerAnnouncements(data ?? EMPTY_ANNOUNCEMENTS, category),
    [category, data],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        day: 'numeric',
        month: 'long',
      }),
    [i18n.resolvedLanguage],
  );
  const openAnnouncement = useCallback((id: string) => push(`/announcement/${id}` as Href), [push]);

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
      const cardProps: AnnouncementCardProps = {
        id: item.id,
        title: title.text,
        body: body.text,
        category: categoryLabel,
        publishedDate,
        imageObjectKeyOrUrl: item.image_url,
        accessToken: session?.access_token,
        imageAlt: imageAlt?.text ?? null,
        accessibilityLabel: completeLabel,
        languageFontClass,
        onOpen: openAnnouncement,
      };

      return (
        <PageWidth className="pb-md">
          {item.is_pinned ? (
            <PinnedAnnouncementCard {...cardProps} pinnedLabel={t('pinned')} />
          ) : (
            <AnnouncementCard {...cardProps} />
          )}
        </PageWidth>
      );
    },
    [dateFormatter, language, languageFontClass, openAnnouncement, session?.access_token, t],
  );

  const onRefresh = useCallback(() => {
    void refetch();
    void refetchForms();
    void refetchSurveys();
    void refetchEvents();
  }, [refetch, refetchEvents, refetchForms, refetchSurveys]);

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
    return (
      <PlayerTabStateFrame title={t('nav:tabs.home')}>
        <AnnouncementFeedSkeleton accessibilityLabel={t('loading')} />
      </PlayerTabStateFrame>
    );
  }

  if (isError && data === undefined) {
    return (
      <PlayerTabStateFrame title={t('nav:tabs.home')}>
        <AnnouncementFeedError
          message={t('loadFailed')}
          retryLabel={t('retryAction')}
          code={toAppError(error).code}
          languageFontClass={languageFontClass}
          onRetry={onRefresh}
        />
      </PlayerTabStateFrame>
    );
  }

  return (
    <FlashList
      testID="home-screen"
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
          <PlayerTabHeader title={t('nav:tabs.home')} />
          {/* Per fer, then her next activity, then the announcements (RAPP-790). */}
          <HomeToDo items={toDoItems} languageFontClass={languageFontClass} />
          <HomeNextActivity occurrence={nextActivity} languageFontClass={languageFontClass} />
          <HomeSectionHeader title={t('feedTitle')} languageFontClass={languageFontClass} />
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

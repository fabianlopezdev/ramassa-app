import { AnnouncementCard } from '@/components/announcements/announcement-card';
import {
  announcementCategoryLabel,
  CategoryFilters,
  countNewAnnouncements,
} from '@/components/announcements/category-filters';
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { HomeNextActivity } from '@/components/home/home-next-activity';
import { HomeToDo } from '@/components/home/home-to-do';
import { PageWidth } from '@/components/layout/content-width';
import { ScreenSection } from '@/components/layout/screen-section';
import { withScreenEntrance } from '@/components/motion/screen-entrance';
import { PlayerTabHeader, PlayerTabStateFrame } from '@/components/profile/player-tab-header';
import { usePlayerAnnouncements } from '@/lib/announcement-feed';
import { useMyCustomForms } from '@/lib/custom-forms';
import { isNetworkStateOnline } from '@/lib/network-status';
import { logger } from '@/lib/observability';
import { usePlayerEvents } from '@/lib/player-events';
import { usePlayerSurveys } from '@/lib/player-surveys';
import { useHomeAttention, useHomeSeen } from '@/lib/use-home-attention';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { usePlayerTabContentInsets } from '@/lib/use-player-tab-content-insets';
import { useListSeenWhen } from '@/lib/use-tab-news';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import {
  filterAndOrderPlayerAnnouncements,
  raiseUnopenedUrgentAnnouncements,
  type AnnouncementListRow,
  type PlayerAnnouncementCategoryFilter,
} from '@ramassa/shared/announcements';
import { toAppError } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE, resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_ANNOUNCEMENTS: readonly AnnouncementListRow[] = [];

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: tokens.colors.surface.page },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing['3xl'],
  },
});

const keyExtractor = (item: AnnouncementListRow) => item.id;

function HomeScreen() {
  const { t, i18n } = useTranslation(['home', 'common', 'nav']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
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
  const refetchSeen = useHomeSeen().refetch;

  // The same count the Inici tab shows as its badge (RAPP-821).
  const {
    toDoItems,
    nextActivity,
    isNextActivityUnseen,
    isNextActivityCounted,
    unseenAnnouncementIds,
  } = useHomeAttention();
  // Seeing Inici clears the number for its new activity. The card keeps "Nou"
  // until she opens the activity (RAPP-873).
  useListSeenWhen('home', true, isNextActivityCounted);
  // An announcement stays new, with its mark and in the counts, until she
  // opens it (RAPP-848); scrolling past it no longer counts.
  const newCounts = useMemo(
    () => countNewAnnouncements(data ?? EMPTY_ANNOUNCEMENTS, unseenAnnouncementIds),
    [data, unseenAnnouncementIds],
  );
  const listExtraData = useMemo(
    () => ({ category, unseenAnnouncementIds }),
    [category, unseenAnnouncementIds],
  );

  const announcements = useMemo(
    () =>
      raiseUnopenedUrgentAnnouncements(
        filterAndOrderPlayerAnnouncements(data ?? EMPTY_ANNOUNCEMENTS, category),
        unseenAnnouncementIds,
      ),
    [category, data, unseenAnnouncementIds],
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
      if (title === undefined) return null;
      const unseenLabel = unseenAnnouncementIds.has(item.id) ? t('unseen') : null;
      const accessibilityLabel = [
        unseenLabel,
        announcementCategoryLabel(item.category, t),
        item.is_pinned ? t('pinned') : null,
        title.text,
        dateFormatter.format(new Date(item.published_at ?? item.created_at)),
      ]
        .filter((part): part is string => typeof part === 'string')
        .join('. ');

      return (
        <PageWidth className="pb-md">
          <AnnouncementCard
            id={item.id}
            title={title.text}
            category={item.category}
            accessibilityLabel={accessibilityLabel}
            imageObjectKey={item.image_url}
            imageAlt={
              item.image_alt === null
                ? undefined
                : resolveLocalizedText(item.image_alt, language)?.text
            }
            unseenLabel={unseenLabel}
            languageFontClass={languageFontClass}
            onOpen={openAnnouncement}
          />
        </PageWidth>
      );
    },
    [dateFormatter, language, languageFontClass, unseenAnnouncementIds, openAnnouncement, t],
  );

  const onRefresh = useCallback(() => {
    void refetch();
    void refetchForms();
    void refetchSurveys();
    void refetchEvents();
    void refetchSeen();
  }, [refetch, refetchEvents, refetchForms, refetchSeen, refetchSurveys]);

  const onListLoad = useCallback(
    ({ elapsedTimeInMs }: { readonly elapsedTimeInMs: number }) => {
      logger.info('announcement feed rendered', {
        elapsedTimeInMs: Math.round(elapsedTimeInMs),
        itemCount: announcements.length,
      });
    },
    [announcements.length],
  );

  const tabInsets = usePlayerTabContentInsets();
  const contentContainerStyle = useMemo(() => [styles.content, tabInsets], [tabInsets]);

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
      extraData={listExtraData}
      style={styles.list}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={isRefetching && !isOffline}
      onRefresh={onRefresh}
      onLoad={onListLoad}
      ListHeaderComponent={
        <PageWidth className="gap-lg pb-lg">
          <PlayerTabHeader title={t('nav:tabs.home')} />
          {/*
            Her next activity, then the forms and surveys that wait, then the
            announcements (RAPP-790). The activity comes first because it is
            what she opens the app for, and it is there every week, so the top
            of Inici stays the same when forms come and go (RAPP-855).
          */}
          <HomeNextActivity
            occurrence={nextActivity}
            isUnseen={isNextActivityUnseen}
            languageFontClass={languageFontClass}
          />
          <HomeToDo items={toDoItems} languageFontClass={languageFontClass} />
          <ScreenSection title={t('feedTitle')} isLast>
            <CategoryFilters
              selected={category}
              newCounts={newCounts}
              onSelect={setCategory}
              t={t}
              languageFontClass={languageFontClass}
            />
          </ScreenSection>
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

export default withScreenEntrance('index', HomeScreen);

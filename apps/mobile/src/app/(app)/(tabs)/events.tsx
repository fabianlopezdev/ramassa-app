import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import {
  EventCard,
  eventCategoryColor,
  playerEventCapacityLabel,
  playerEventSignupLabel,
} from '@/components/events/event-card';
import {
  EventCategoryFilters,
  EventViewToggle,
  type PlayerEventFilterOption,
} from '@/components/events/event-filters';
import { EventMonthCalendar } from '@/components/events/event-month-calendar';
import { PageWidth } from '@/components/layout/content-width';
import { RaisedIconCard } from '@/components/layout/raised-icon-card';
import { ScreenSection, SectionTitle } from '@/components/layout/screen-section';
import { withScreenEntrance } from '@/components/motion/screen-entrance';
import { PlayerTabHeader, PlayerTabStateFrame } from '@/components/profile/player-tab-header';
import {
  addPrivateMentoringMarkedDates,
  buildEventMarkedDates,
  eventDateKey,
} from '@/lib/event-calendar';
import { isNetworkStateOnline } from '@/lib/network-status';
import { logger } from '@/lib/observability';
import { usePlayerEvents } from '@/lib/player-events';
import { usePlayerMentoringRequests } from '@/lib/player-mentoring';
import { playerNavIcons } from '@/lib/player-nav-icons';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { usePlayerTabContentInsets } from '@/lib/use-player-tab-content-insets';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import type { MarkedDates } from 'react-native-calendars/src/types';
import { toAppError } from '@ramassa/shared/errors';
import {
  filterPlayerEventOccurrences,
  MADRID_TIME_ZONE,
  type PlayerEventCategoryFilter,
  type PlayerEventOccurrence,
} from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE, resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { getPrivateMentoringCalendarEntries } from '@ramassa/shared/mentoring';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_EVENTS: readonly PlayerEventOccurrence[] = [];
const UTC_MIDDAY_SUFFIX = 'T12:00:00Z';

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: tokens.colors.surface.page },
  hidden: { display: 'none' },
  content: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing['3xl'] },
});

const keyExtractor = (item: PlayerEventOccurrence) => item.occurrence_id;
const getItemType = (item: PlayerEventOccurrence) =>
  item.signup?.state === 'confirmed' || item.signup?.state === 'interested'
    ? 'signed-up-event'
    : 'event';

function EventsScreen() {
  const { t, i18n } = useTranslation(['events', 'common', 'mentoring', 'nav']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const brandColor = useBrandColor();
  const { push } = useRouter();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const [category, setCategory] = useState<PlayerEventCategoryFilter>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  // The switch answers the tap at once; the list or calendar under it follows
  // as soon as React has it ready, without holding the switch back.
  const contentView = useDeferredValue(view);
  // Once opened, the calendar stays mounted and only hides behind the list, so
  // coming back to it skips building its weeks again and keeps her month.
  const [hasOpenedCalendar, setHasOpenedCalendar] = useState(false);
  if (contentView === 'calendar' && !hasOpenedCalendar) setHasOpenedCalendar(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { data, isPending, isError, error, isRefetching, refetch } = usePlayerEvents();
  const mentoringQuery = usePlayerMentoringRequests();
  const refetchMentoring = mentoringQuery.refetch;
  const now = new Date();
  const events = useMemo(
    () => filterPlayerEventOccurrences(data ?? EMPTY_EVENTS, category, now),
    [category, data],
  );
  const mentoringEntries = useMemo(
    () => getPrivateMentoringCalendarEntries(mentoringQuery.data ?? []),
    [mentoringQuery.data],
  );
  const { categories, categoryColorsById } = useMemo(() => {
    const byId = new Map<string, PlayerEventFilterOption>();
    const colorsById = new Map<string, PlayerEventOccurrence['event']['category']['color']>();
    for (const row of data ?? EMPTY_EVENTS) {
      colorsById.set(row.event.category.id, row.event.category.color);
      const name = resolveLocalizedText(row.event.category.name, language);
      if (name !== undefined) {
        byId.set(row.event.category.id, {
          id: row.event.category.id,
          label: name.text,
        });
      }
    }
    return { categories: [...byId.values()], categoryColorsById: colorsById };
  }, [data, language]);
  const effectiveSelectedDate =
    selectedDate ??
    eventDateKey(
      events[0]?.occurrence_starts_at ?? mentoringEntries[0]?.scheduledAt ?? now.toISOString(),
    );
  const visibleEvents = useMemo(
    () =>
      contentView === 'list'
        ? events
        : events.filter((row) => eventDateKey(row.occurrence_starts_at) === effectiveSelectedDate),
    [effectiveSelectedDate, events, contentView],
  );
  const visibleMentoringEntries = useMemo(
    () =>
      contentView === 'list'
        ? mentoringEntries
        : mentoringEntries.filter(
            (entry) => eventDateKey(entry.scheduledAt) === effectiveSelectedDate,
          ),
    [effectiveSelectedDate, mentoringEntries, contentView],
  );
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'long',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const markedDates = useMemo(
    () =>
      addPrivateMentoringMarkedDates(
        buildEventMarkedDates(
          events,
          effectiveSelectedDate,
          (categoryId) =>
            eventCategoryColor(categoryColorsById.get(categoryId) ?? 'primary', brandColor),
          (date) =>
            t('playerSelectedDate', {
              date: dateFormatter.format(new Date(`${date}${UTC_MIDDAY_SUFFIX}`)),
            }),
        ),
        mentoringEntries,
        (date) =>
          `${t('mentoring:title')}. ${dateFormatter.format(
            new Date(`${date}${UTC_MIDDAY_SUFFIX}`),
          )}`,
      ) as MarkedDates,
    [
      brandColor,
      categoryColorsById,
      dateFormatter,
      effectiveSelectedDate,
      events,
      mentoringEntries,
      t,
    ],
  );
  const openOccurrence = useCallback(
    (eventId: string, occurrenceId: string) => {
      push({
        pathname: '/event/[id]',
        params: { id: eventId, occurrenceId },
      } as unknown as Href);
    },
    [push],
  );
  const openMentoring = useCallback(() => push('/mentoring' as Href), [push]);
  const mentoringWhen = useCallback(
    (scheduledAt: string) =>
      `${dateFormatter.format(new Date(scheduledAt))} · ${timeFormatter.format(new Date(scheduledAt))}`,
    [dateFormatter, timeFormatter],
  );

  const renderEvent = useCallback(
    ({ item }: ListRenderItemInfo<PlayerEventOccurrence>) => {
      const title = resolveLocalizedText(item.event.title, language);
      const categoryName = resolveLocalizedText(item.event.category.name, language);
      if (title === undefined || categoryName === undefined) return null;
      const date = dateFormatter.format(new Date(item.occurrence_starts_at));
      const time = timeFormatter.format(new Date(item.occurrence_starts_at));
      const capacity = playerEventCapacityLabel(item, t);
      const signup = playerEventSignupLabel(item.signup?.state, t);
      return (
        <PageWidth className="pb-md">
          <EventCard
            eventId={item.event.id}
            occurrenceId={item.occurrence_id}
            title={title.text}
            startsAt={item.occurrence_starts_at}
            locale={locale}
            location={item.event.location}
            signupLabel={signup}
            accessibilityLabel={[
              t('playerOpenEvent', { title: title.text }),
              categoryName.text,
              date,
              time,
              item.event.location,
              capacity,
              signup,
            ]
              .filter((value): value is string => typeof value === 'string')
              .join('. ')}
            languageFontClass={languageFontClass}
            onOpen={openOccurrence}
          />
        </PageWidth>
      );
    },
    [dateFormatter, language, languageFontClass, locale, openOccurrence, t, timeFormatter],
  );

  const tabInsets = usePlayerTabContentInsets();
  const contentContainerStyle = useMemo(() => [styles.content, tabInsets], [tabInsets]);
  const onRefresh = useCallback(
    () => void Promise.all([refetch(), refetchMentoring()]),
    [refetch, refetchMentoring],
  );
  // The day presses with its own selection haptic.
  const selectCalendarDay = useCallback((date: string) => setSelectedDate(date), []);
  const listExtraData = useMemo(
    () => ({ category, effectiveSelectedDate, view: contentView }),
    [category, effectiveSelectedDate, contentView],
  );
  const onListLoad = useCallback(
    ({ elapsedTimeInMs }: { readonly elapsedTimeInMs: number }) => {
      logger.info('player events rendered', {
        elapsedTimeInMs: Math.round(elapsedTimeInMs),
        itemCount: visibleEvents.length,
        view: contentView,
      });
    },
    [contentView, visibleEvents.length],
  );

  if (isPending && data === undefined) {
    return (
      <PlayerTabStateFrame title={t('nav:tabs.events')}>
        <AnnouncementFeedSkeleton accessibilityLabel={t('playerLoading')} />
      </PlayerTabStateFrame>
    );
  }
  if (isError && data === undefined) {
    return (
      <PlayerTabStateFrame title={t('nav:tabs.events')}>
        <AnnouncementFeedError
          message={t('playerLoadFailed')}
          retryLabel={t('playerRetryAction')}
          code={toAppError(error).code}
          languageFontClass={languageFontClass}
          onRetry={onRefresh}
        />
      </PlayerTabStateFrame>
    );
  }

  return (
    <FlashList
      testID="player-events-screen"
      data={visibleEvents}
      renderItem={renderEvent}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      extraData={listExtraData}
      style={styles.list}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={isRefetching && !isOffline}
      onRefresh={onRefresh}
      onLoad={onListLoad}
      ListHeaderComponent={
        <PageWidth className="gap-lg pb-lg">
          <PlayerTabHeader title={t('nav:tabs.events')}>
            <EventViewToggle
              selected={view}
              listLabel={t('playerListView')}
              calendarLabel={t('playerCalendarView')}
              listAccessibilityLabel={t('playerListViewAction')}
              calendarAccessibilityLabel={t('playerCalendarViewAction')}
              accessibilityLabel={t('playerViewLabel')}
              languageFontClass={languageFontClass}
              onSelect={setView}
            />
          </PlayerTabHeader>
          <EventCategoryFilters
            categories={categories}
            selected={category}
            allLabel={t('playerFilterAll')}
            accessibilityLabel={t('playerFilterLabel')}
            languageFontClass={languageFontClass}
            onSelect={setCategory}
          />
          {/* Her mentoring appointments, a shortcut to Mentoria with the same
              name and icon as its row in Xat (RAPP-793). */}
          {visibleMentoringEntries.length === 0 ? null : (
            <View className="gap-sm">
              {visibleMentoringEntries.map((entry) => (
                <RaisedIconCard
                  key={entry.id}
                  testID={`private-mentoring-calendar-${entry.id}`}
                  icon={playerNavIcons.mentoring}
                  title={t('mentoring:title')}
                  detail={mentoringWhen(entry.scheduledAt)}
                  accessibilityLabel={`${t('mentoring:title')}, ${mentoringWhen(entry.scheduledAt)}`}
                  languageFontClass={languageFontClass}
                  onOpen={openMentoring}
                />
              ))}
            </View>
          )}
          {hasOpenedCalendar ? (
            <View className="gap-lg" style={contentView === 'calendar' ? undefined : styles.hidden}>
              <ScreenSection title={t('playerCalendarLabel')}>
                <EventMonthCalendar
                  language={language}
                  todayLabel={t('playerToday')}
                  previousMonthLabel={t('playerPreviousMonth')}
                  nextMonthLabel={t('playerNextMonth')}
                  current={effectiveSelectedDate}
                  minDate={eventDateKey(now.toISOString())}
                  markedDates={markedDates}
                  onSelectDay={selectCalendarDay}
                  testID="player-events-calendar"
                />
              </ScreenSection>
              <SectionTitle
                className="tabular-nums"
                title={t('playerSelectedDate', {
                  date: dateFormatter.format(
                    new Date(`${effectiveSelectedDate}${UTC_MIDDAY_SUFFIX}`),
                  ),
                })}
              />
            </View>
          ) : null}
        </PageWidth>
      }
      ListEmptyComponent={
        <PageWidth>
          <AnnouncementEmptyState
            title={
              contentView === 'calendar' && events.length > 0
                ? t('playerNoEventsDate')
                : t('playerEmptyTitle')
            }
            body={contentView === 'calendar' && events.length > 0 ? '' : t('playerEmptyBody')}
            languageFontClass={languageFontClass}
          />
        </PageWidth>
      }
    />
  );
}

export default withScreenEntrance('events', EventsScreen);

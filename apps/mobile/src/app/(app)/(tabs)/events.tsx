import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { EventCard, eventCategoryColor } from '@/components/events/event-card';
import {
  EventCategoryFilters,
  EventViewToggle,
  type PlayerEventFilterOption,
} from '@/components/events/event-filters';
import { PageWidth } from '@/components/layout/content-width';
import { buildCalendarLocale, buildEventMarkedDates, eventDateKey } from '@/lib/event-calendar';
import { isNetworkStateOnline } from '@/lib/network-status';
import { logger } from '@/lib/observability';
import { usePlayerEvents } from '@/lib/player-events';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import type { MarkedDates } from 'react-native-calendars/src/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import {
  filterPlayerEventOccurrences,
  type EventSignupState,
  type PlayerEventCategoryFilter,
  type PlayerEventOccurrence,
} from '@ramassa/shared/events';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_EVENTS: readonly PlayerEventOccurrence[] = [];

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: tokens.colors.white },
  content: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing['3xl'] },
  calendar: {
    borderWidth: 1,
    borderColor: tokens.colors.neutral[200],
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
});

const keyExtractor = (item: PlayerEventOccurrence) => item.occurrence_id;
const getItemType = (item: PlayerEventOccurrence) =>
  item.signup?.state === 'confirmed' || item.signup?.state === 'interested'
    ? 'signed-up-event'
    : 'event';

function signupLabel(state: EventSignupState | undefined, t: TFunction) {
  if (state === 'confirmed') return t('playerConfirmed');
  if (state === 'interested') return t('playerInterested');
  return null;
}

function capacityLabel(row: PlayerEventOccurrence, t: TFunction) {
  const maximum = row.event.max_participants;
  if (maximum === null) return t('playerUnlimited');
  const remaining = Math.max(0, maximum - row.event.active_signup_count);
  return remaining === 0 ? t('playerFull') : t('playerPlaces', { remaining, total: maximum });
}

export default function EventsScreen() {
  const { t, i18n } = useTranslation(['events', 'common']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const [category, setCategory] = useState<PlayerEventCategoryFilter>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { data, isPending, isError, error, isRefetching, refetch } = usePlayerEvents();
  const now = new Date();
  const events = useMemo(
    () => filterPlayerEventOccurrences(data ?? EMPTY_EVENTS, category, now),
    [category, data],
  );
  const categories = useMemo(() => {
    const byId = new Map<string, PlayerEventFilterOption>();
    for (const row of data ?? EMPTY_EVENTS) {
      const name = resolveLocalizedText(row.event.category.name, language);
      if (name !== undefined) {
        byId.set(row.event.category.id, {
          id: row.event.category.id,
          label: name.text,
          color: row.event.category.color,
        });
      }
    }
    return [...byId.values()];
  }, [data, language]);
  const effectiveSelectedDate =
    selectedDate ?? eventDateKey(events[0]?.occurrence_starts_at ?? now.toISOString());
  const visibleEvents = useMemo(
    () =>
      view === 'list'
        ? events
        : events.filter((row) => eventDateKey(row.occurrence_starts_at) === effectiveSelectedDate),
    [effectiveSelectedDate, events, view],
  );
  const occurrenceById = useMemo(
    () => new Map((data ?? EMPTY_EVENTS).map((row) => [row.occurrence_id, row])),
    [data],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'long',
        timeZone: 'Europe/Madrid',
      }),
    [i18n.resolvedLanguage],
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Madrid',
      }),
    [i18n.resolvedLanguage],
  );
  const calendarLocaleKey = `ramassa-${language}`;
  const calendarLocale = useMemo(
    () => buildCalendarLocale(language, t('playerToday')),
    [language, t],
  );
  LocaleConfig.locales[calendarLocaleKey] = {
    monthNames: [...calendarLocale.monthNames],
    monthNamesShort: [...calendarLocale.monthNamesShort],
    dayNames: [...calendarLocale.dayNames],
    dayNamesShort: [...calendarLocale.dayNamesShort],
    today: calendarLocale.today,
  };
  LocaleConfig.defaultLocale = calendarLocaleKey;
  const markedDates = useMemo(
    () =>
      buildEventMarkedDates(events, effectiveSelectedDate, (categoryId) => {
        const event = events.find((row) => row.event.category_id === categoryId);
        return eventCategoryColor(event?.event.category.color ?? 'primary');
      }) as MarkedDates,
    [effectiveSelectedDate, events],
  );

  const openOccurrence = useCallback(
    (occurrenceId: string) => {
      const row = occurrenceById.get(occurrenceId);
      if (row === undefined) return;
      router.push({
        pathname: '/event/[id]',
        params: { id: row.event.id, occurrenceId },
      } as unknown as Href);
    },
    [occurrenceById, router],
  );

  const renderEvent = useCallback(
    ({ item }: ListRenderItemInfo<PlayerEventOccurrence>) => {
      const title = resolveLocalizedText(item.event.title, language);
      const categoryName = resolveLocalizedText(item.event.category.name, language);
      if (title === undefined || categoryName === undefined) return null;
      const date = dateFormatter.format(new Date(item.occurrence_starts_at));
      const time = timeFormatter.format(new Date(item.occurrence_starts_at));
      const capacity = capacityLabel(item, t);
      const signup = signupLabel(item.signup?.state, t);
      return (
        <PageWidth className="pb-md">
          <EventCard
            eventId={item.event.id}
            occurrenceId={item.occurrence_id}
            title={title.text}
            category={categoryName.text}
            categoryColor={item.event.category.color}
            date={date}
            time={time}
            location={item.event.location}
            capacityLabel={capacity}
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
    [dateFormatter, language, languageFontClass, openOccurrence, t, timeFormatter],
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
  const onRefresh = useCallback(() => void refetch(), [refetch]);

  if (isPending && data === undefined) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('playerLoading')} />;
  }
  if (isError && data === undefined) {
    return (
      <AnnouncementFeedError
        message={t('playerLoadFailed')}
        retryLabel={t('playerRetryAction')}
        code={toAppError(error).code}
        languageFontClass={languageFontClass}
        onRetry={onRefresh}
      />
    );
  }

  return (
    <FlashList
      data={visibleEvents}
      renderItem={renderEvent}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      extraData={{ category, effectiveSelectedDate, view }}
      style={styles.list}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={isRefetching && !isOffline}
      onRefresh={onRefresh}
      onLoad={({ elapsedTimeInMs }) =>
        logger.info('player events rendered', {
          elapsedTimeInMs: Math.round(elapsedTimeInMs),
          itemCount: visibleEvents.length,
          view,
        })
      }
      ListHeaderComponent={
        <PageWidth className="gap-lg pb-lg">
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('playerTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('playerIntro')}
            </Text>
          </View>
          {isOffline ? (
            <OfflineBanner label={t('playerOfflineBanner')} languageFontClass={languageFontClass} />
          ) : null}
          <EventCategoryFilters
            categories={categories}
            selected={category}
            allLabel={t('playerFilterAll')}
            accessibilityLabel={t('playerFilterLabel')}
            languageFontClass={languageFontClass}
            onSelect={setCategory}
          />
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
          {view === 'calendar' ? (
            <View className="gap-sm">
              <Text
                accessibilityRole="header"
                className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('playerCalendarLabel')}
              </Text>
              <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                {t('playerCalendarHint')}
              </Text>
              <Calendar
                key={calendarLocaleKey}
                current={effectiveSelectedDate}
                minDate={eventDateKey(now.toISOString())}
                firstDay={1}
                markingType="multi-dot"
                markedDates={markedDates}
                enableSwipeMonths
                onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
                testID="player-events-calendar"
                style={styles.calendar}
                theme={{
                  calendarBackground: tokens.colors.white,
                  selectedDayBackgroundColor: tokens.colors.primary.light,
                  selectedDayTextColor: tokens.colors.neutral[900],
                  todayTextColor: tokens.colors.primary.dark,
                  arrowColor: tokens.colors.primary.DEFAULT,
                  monthTextColor: tokens.colors.neutral[900],
                  dayTextColor: tokens.colors.neutral[800],
                  textDisabledColor: tokens.colors.neutral[400],
                }}
              />
              <Text
                accessibilityRole="header"
                className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('playerSelectedDate', {
                  date: dateFormatter.format(new Date(`${effectiveSelectedDate}T12:00:00Z`)),
                })}
              </Text>
            </View>
          ) : null}
        </PageWidth>
      }
      ListEmptyComponent={
        <PageWidth>
          <AnnouncementEmptyState
            title={
              view === 'calendar' && events.length > 0
                ? t('playerNoEventsDate')
                : t('playerEmptyTitle')
            }
            body={view === 'calendar' && events.length > 0 ? '' : t('playerEmptyBody')}
            languageFontClass={languageFontClass}
          />
        </PageWidth>
      }
    />
  );
}

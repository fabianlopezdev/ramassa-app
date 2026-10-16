/**
 * One event for the team (RAPP-342): its status, category and schedule, the
 * place with its map link, places and sign-up, the publication, the Catalan
 * description, and the sessions the database made from the schedule. Edit
 * opens the editor; deleting is for `events.publish` holders, as the database
 * requires, and asks first. A screen of its own on a phone; the right half of
 * the list on a tablet.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { PreviewItemAsPlayer } from '@/components/preview/preview-as-player';
import { useContentEvent, useContentEventOccurrences, useEventActions } from '@/lib/content-events';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { getAnnouncementLifecycle } from '@ramassa/shared/announcements';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';
import { formatEventCapacity, MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { EventCategoryBadge } from './event-category-badge';
import { EVENT_SIGNUP_KEYS, EVENT_STATUS_KEYS } from './event-labels';
import { useRecurrenceLabel } from './event-list';

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className="gap-xs py-xs">
      <Text className={`text-start text-sm text-neutral-500 ${fontClass}`}>{label}</Text>
      <Text className={`text-start text-md tabular-nums text-neutral-900 ${fontClass}`}>
        {value}
      </Text>
    </View>
  );
}

export function EventDetail({
  eventId,
  onBack,
  onDeleted,
}: {
  readonly eventId: string;
  readonly onBack?: () => void;
  readonly onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation('events');
  const { t: tAnnouncements } = useTranslation('announcements');
  const { t: tCommon } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const canPublish = useAccountAccess().permissions.has('events.publish');
  const { push } = useRouter();
  const event = useContentEvent(eventId);
  const occurrences = useContentEventOccurrences(eventId);
  const { remove } = useEventActions();
  const recurrenceLabel = useRecurrenceLabel();
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );

  if (event.isPending) return <AnnouncementFeedSkeleton accessibilityLabel={t('title')} />;
  if (event.isError) {
    return (
      <AnnouncementFeedError
        message={t('playerLoadFailed')}
        retryLabel={tErrors('retry')}
        code={toAppError(event.error).code}
        languageFontClass={fontClass}
        onRetry={() => void event.refetch()}
        isLoading={event.isFetching}
      />
    );
  }
  const data = event.data;
  if (data === undefined) {
    return (
      <AnnouncementEmptyState title={t('playerLoadFailed')} body="" languageFontClass={fontClass} />
    );
  }

  const lifecycle = getAnnouncementLifecycle({
    status: data.status,
    publishedAt: data.published_at,
    expiresAt: data.expires_at,
  });
  const date = (value: string | null) =>
    value === null ? t('none') : format.format(new Date(value));
  const confirmDelete = () => {
    const done = () =>
      remove.mutate(data.id, {
        onSuccess: () => {
          playHaptic('success');
          onDeleted();
        },
      });
    // The web build has no native alert, so it asks through the browser.
    if (Platform.OS === 'web') {
      if (window.confirm(t('deleteConfirm'))) done();
      return;
    }
    Alert.alert(t('deleteConfirm'), data.title.ca, [
      { text: tProfile('cancelAction'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: done },
    ]);
  };
  const locationUrl = data.location_url;

  return (
    <ScrollView contentContainerClassName="gap-md p-lg" testID="event-detail">
      {onBack === undefined ? null : (
        <PressableScale
          accessibilityLabel={tCommon('back')}
          onPress={onBack}
          haptic="tapLight"
          className="min-h-recommended self-start justify-center"
        >
          <Text className={`font-semibold text-primary-dark ${fontClass}`}>{tCommon('back')}</Text>
        </PressableScale>
      )}
      <View className="gap-xs">
        <Text
          accessibilityRole="header"
          className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
        >
          {data.title.ca}
        </Text>
        <Text
          testID="event-detail-status"
          className={`text-start text-sm font-semibold text-neutral-700 ${fontClass}`}
        >
          {t(EVENT_STATUS_KEYS[lifecycle])}
        </Text>
        <EventCategoryBadge category={data.category} />
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <PressableScale
          testID="event-edit"
          accessibilityRole="button"
          accessibilityLabel={t('editTitle')}
          onPress={() => push(`/content-event-edit/${data.id}` as Href)}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {tAnnouncements('editAction')}
          </Text>
        </PressableScale>
        {canPublish ? (
          <PressableScale
            testID="event-delete"
            accessibilityRole="button"
            accessibilityLabel={t('delete')}
            onPress={confirmDelete}
            isBusy={remove.isPending}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-error bg-white px-lg"
          >
            <Text className={`text-center text-md font-bold text-error ${fontClass}`}>
              {t('delete')}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      <PreviewItemAsPlayer
        target={`/event/${data.id}`}
        isVisibleToPlayers={lifecycle === 'published'}
      />
      {remove.isError ? (
        <FailureNotice
          code={toAppError(remove.error).code}
          message={tErrors(getErrorMessageKey(toAppError(remove.error).code))}
        />
      ) : null}
      <View
        style={continuousCorners}
        className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
      >
        <Row label={t('columnStart')} value={date(data.starts_at)} />
        <Row label={t('playerEnds')} value={date(data.ends_at)} />
        <Row label={t('columnRecurrence')} value={recurrenceLabel(data.recurrence_rule)} />
        <Row label={t('fieldLocation')} value={data.location} />
        {locationUrl === null ? null : (
          <PressableScale
            testID="event-detail-map"
            accessibilityRole="link"
            accessibilityLabel={t('playerOpenMap')}
            onPress={() => void Linking.openURL(locationUrl)}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {t('playerOpenMap')}
            </Text>
          </PressableScale>
        )}
        <Row
          label={t('columnCapacity')}
          value={formatEventCapacity(
            data.active_signup_count,
            data.max_participants,
            t('unlimited'),
          )}
        />
        <Row label={t('columnSignup')} value={t(EVENT_SIGNUP_KEYS[data.signup_mode])} />
        <Row label={tAnnouncements('columnPublication')} value={date(data.published_at)} />
        <Row label={tAnnouncements('columnExpiry')} value={date(data.expires_at)} />
      </View>
      {data.description === null ? null : (
        <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
          {data.description.ca}
        </Text>
      )}
      {occurrences.data === undefined || occurrences.data.length < 2 ? null : (
        <View className="gap-xs" testID="event-detail-sessions">
          <Text
            accessibilityRole="header"
            className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
          >
            {t('sessionsTitle', { count: occurrences.data.length })}
          </Text>
          {occurrences.data.map((occurrence) => (
            <Text
              key={occurrence.id}
              className={`text-start text-md tabular-nums text-neutral-800 ${fontClass}`}
            >
              {format.format(new Date(occurrence.starts_at))}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

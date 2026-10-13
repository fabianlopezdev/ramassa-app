/**
 * One announcement for the team (RAPP-340): its status and dates, the Catalan
 * text, and pinning and deleting as the web admin's list has them. Deleting is
 * for `announcements.publish` holders, as the database requires, and asks
 * first. A screen of its own on a phone; the right half of the list on a
 * tablet. The editor comes with RAPP-341.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useAnnouncementActions, useContentAnnouncement } from '@/lib/content-announcements';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { getAnnouncementLifecycle } from '@ramassa/shared/announcements';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { ANNOUNCEMENT_CATEGORY_KEYS, ANNOUNCEMENT_STATUS_KEYS } from './announcement-labels';

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className="gap-xs py-xs">
      <Text className={`text-start text-sm text-neutral-500 ${fontClass}`}>{label}</Text>
      <Text className={`text-start text-md text-neutral-900 ${fontClass}`}>{value}</Text>
    </View>
  );
}

export function AnnouncementDetail({
  announcementId,
  onBack,
  onDeleted,
}: {
  readonly announcementId: string;
  readonly onBack?: () => void;
  readonly onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation('announcements');
  const { t: tCommon } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { permissions } = useAccountAccess();
  const canPublish = permissions.has('announcements.publish');
  const announcement = useContentAnnouncement(announcementId);
  const { setPinned, remove } = useAnnouncementActions();
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );

  if (announcement.isPending) return <AnnouncementFeedSkeleton accessibilityLabel={t('title')} />;
  if (announcement.isError) {
    return (
      <AnnouncementFeedError
        message={t('loadFailed')}
        retryLabel={tErrors('retry')}
        code={toAppError(announcement.error).code}
        languageFontClass={fontClass}
        onRetry={() => void announcement.refetch()}
        isLoading={announcement.isFetching}
      />
    );
  }
  const data = announcement.data;
  if (data === undefined) {
    return <AnnouncementEmptyState title={t('loadFailed')} body="" languageFontClass={fontClass} />;
  }

  const lifecycle = getAnnouncementLifecycle({
    status: data.status,
    publishedAt: data.published_at,
    expiresAt: data.expires_at,
  });
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
    Alert.alert(t('deleteConfirm'), data.title.ca ?? '', [
      { text: tProfile('cancelAction'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: done },
    ]);
  };

  return (
    <ScrollView contentContainerClassName="gap-md p-lg" testID="announcement-detail">
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
          {data.title.ca ?? ''}
        </Text>
        <Text className={`text-start text-sm font-semibold text-neutral-700 ${fontClass}`}>
          {[t(ANNOUNCEMENT_STATUS_KEYS[lifecycle]), data.is_pinned ? t('pinned') : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <PressableScale
          testID="announcement-pin"
          accessibilityRole="button"
          accessibilityLabel={data.is_pinned ? t('unpin') : t('pin')}
          onPress={() => setPinned.mutate({ id: data.id, isPinned: !data.is_pinned })}
          isBusy={setPinned.isPending}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
        >
          <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
            {data.is_pinned ? t('unpin') : t('pin')}
          </Text>
        </PressableScale>
        {canPublish ? (
          <PressableScale
            testID="announcement-delete"
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
      {setPinned.isError || remove.isError ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${fontClass}`}
        >
          {t('saveFailed')}
        </Text>
      ) : null}
      <View
        style={continuousCorners}
        className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
      >
        <Row label={t('columnCategory')} value={t(ANNOUNCEMENT_CATEGORY_KEYS[data.category])} />
        <Row
          label={t('columnPublication')}
          value={
            data.published_at === null ? t('none') : format.format(new Date(data.published_at))
          }
        />
        <Row
          label={t('columnExpiry')}
          value={data.expires_at === null ? t('none') : format.format(new Date(data.expires_at))}
        />
      </View>
      <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
        {data.body.ca ?? ''}
      </Text>
    </ScrollView>
  );
}

/**
 * One announcement for the team (RAPP-340): its status and dates, the Catalan
 * text, and pinning and deleting as the web admin's list has them. Deleting is
 * for `announcements.publish` holders, as the database requires, and asks
 * first. A screen of its own on a phone; the right half of the list on a
 * tablet. Edit opens the editor (RAPP-341).
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { PreviewItemAsPlayer } from '@/components/preview/preview-as-player';
import { useAnnouncementActions, useContentAnnouncement } from '@/lib/content-announcements';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
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
  onDeleted,
}: {
  readonly announcementId: string;
  readonly onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation('announcements');
  const { t: tProfile } = useTranslation('profile');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { permissions } = useAccountAccess();
  const canPublish = permissions.has('announcements.publish');
  const { push } = useRouter();
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
        <AuthSubmitButton
          testID="announcement-edit"
          label={t('editAction')}
          onPress={() => push(`/content-announcement-edit/${data.id}` as Href)}
        />
        <RaisedActionButton
          testID="announcement-pin"
          label={data.is_pinned ? t('unpin') : t('pin')}
          onPress={() => setPinned.mutate({ id: data.id, isPinned: !data.is_pinned })}
          isDisabled={setPinned.isPending}
        />
        {canPublish ? (
          <RaisedActionButton
            testID="announcement-delete"
            tone="danger"
            label={t('delete')}
            onPress={confirmDelete}
            isDisabled={remove.isPending}
          />
        ) : null}
      </View>
      <PreviewItemAsPlayer
        target={`/announcement/${data.id}`}
        isVisibleToPlayers={lifecycle === 'published'}
      />
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

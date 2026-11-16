/**
 * Moderació (RAPP-380, RAPP-381, RAPP-802): one screen with a Fòrum segment
 * for `forum.moderate` holders and a Galeria segment for `gallery.moderate`
 * holders; either permission opens it, and with one segment the control does
 * not show. Fòrum lists the reported posts and replies and opens the forum
 * categories (RAPP-386). Galeria lists the reported photos, then every photo
 * and video with its filters. A reported photo is in the Galeria segment only.
 * `?segment=gallery` opens on Galeria.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { ModerationReports } from '@/components/forum/moderation-reports';
import { GalleryModeration } from '@/components/gallery/gallery-moderation';
import { PageWidth } from '@/components/layout/content-width';
import { SegmentedControl } from '@/components/layout/segmented-control';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useForumModerationCategories, useForumModerationQueue } from '@/lib/team-forum';
import {
  moderationSegments,
  selectedModerationSegment,
  splitModerationQueue,
  type ModerationSegment,
} from '@/lib/team-moderation';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ForumModerationQueueRow } from '@ramassa/shared/forum';

const NO_ROWS: readonly ForumModerationQueueRow[] = [];

export default function ForumModerationScreen() {
  const { t } = useTranslation('forum');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
  const { segment: requested } = useLocalSearchParams<{ segment?: string }>();
  const { permissions } = useAccountAccess();
  const available = useMemo(() => moderationSegments(permissions), [permissions]);
  const [chosen, setChosen] = useState<ModerationSegment | null>(null);
  const segment = selectedModerationSegment(available, chosen ?? requested);
  const queue = useForumModerationQueue();
  const categories = useForumModerationCategories();
  const { forum, gallery } = useMemo(
    () => splitModerationQueue(queue.data ?? NO_ROWS),
    [queue.data],
  );

  const options = useMemo(
    () =>
      available.map((key) => ({
        key,
        label: key === 'forum' ? t('moderationSegmentForum') : t('gallery'),
        count: queue.isSuccess ? (key === 'forum' ? forum.length : gallery.length) : undefined,
        testID: `moderation-segment-${key}`,
      })),
    [available, forum.length, gallery.length, queue.isSuccess, t],
  );

  const header = (
    <View className="gap-md">
      <PressableScale
        testID="forum-moderation-back"
        accessibilityLabel={tCommon('back')}
        onPress={back}
        haptic="tapLight"
        className="min-h-recommended self-start justify-center"
      >
        <Text className={`font-semibold text-primary-dark ${fontClass}`}>{tCommon('back')}</Text>
      </PressableScale>
      <Text
        accessibilityRole="header"
        className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
      >
        {t('moderationScreenTitle')}
      </Text>
      {options.length > 1 && segment !== null ? (
        <SegmentedControl
          testID="moderation-segments"
          options={options}
          selected={segment}
          onSelect={setChosen}
          accessibilityLabel={t('moderationScreenTitle')}
          languageFontClass={fontClass}
        />
      ) : null}
    </View>
  );

  const queueState = queue.isPending ? (
    <AnnouncementFeedSkeleton accessibilityLabel={t('moderationScreenTitle')} />
  ) : queue.isError ? (
    <Text className={`text-start text-md text-error ${fontClass}`}>
      {t('moderationActionFailed')}
    </Text>
  ) : null;

  if (segment === 'gallery') {
    return (
      <SafeAreaView
        testID="forum-moderation"
        className="flex-1 bg-neutral-50"
        edges={['top', 'left', 'right']}
      >
        <GalleryModeration
          header={
            <View className="gap-md px-lg pt-lg">
              {header}
              {queueState}
              {gallery.length === 0 ? null : (
                <View className="gap-sm" testID="gallery-reports">
                  <Text
                    accessibilityRole="header"
                    className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
                  >
                    {t('moderationReportedTitle')}
                  </Text>
                  <ModerationReports rows={gallery} categories={categories.data ?? []} />
                </View>
              )}
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      testID="forum-moderation"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          {header}
          {queue.isSuccess ? (
            <Text
              testID="forum-moderation-total"
              className={`text-start text-md text-neutral-600 ${fontClass}`}
            >
              {t('moderationCount', { count: forum.length })}
            </Text>
          ) : null}
          <PressableScale
            testID="forum-moderation-categories"
            accessibilityRole="button"
            accessibilityLabel={t('categoryManagerTitle')}
            onPress={() => push('/forum-categories' as Href)}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center self-start rounded-md border border-neutral-300 bg-white px-lg"
          >
            <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
              {t('categoryManagerTitle')}
            </Text>
          </PressableScale>
          {queueState}
          {queue.isSuccess && forum.length === 0 ? (
            <View className="gap-xs py-xl">
              <Text className={`text-center text-lg font-semibold text-neutral-900 ${fontClass}`}>
                {t('moderationEmptyTitle')}
              </Text>
              <Text className={`text-center text-md text-neutral-600 ${fontClass}`}>
                {t('moderationEmptyBody')}
              </Text>
            </View>
          ) : (
            <ModerationReports rows={forum} categories={categories.data ?? []} />
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

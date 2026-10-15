/**
 * Forum moderation on the phone (RAPP-380), for `forum.moderate` holders, as
 * the web admin's moderation screen: each reported post, reply or gallery
 * photo with its reports, reasons and comments, and the team's actions on it.
 * Delete asks first. The author can be contacted by whoever has the inbox.
 * Forum posting bans stay on the participant's card. The forum categories open
 * from here (RAPP-386).
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import {
  moderationKey,
  useForumModerationActions,
  useForumModerationCategories,
  useForumModerationQueue,
  type ForumModerationRequest,
} from '@/lib/team-forum';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import type { ForumCategoryRow, ForumModerationQueueRow } from '@ramassa/shared/forum';
import {
  DEFAULT_LANGUAGE,
  resolveLocalizedText,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  thumbnail: { width: '100%', height: tokens.contentWidth.form / 2 },
});
const thumbnailStyle = [styles.thumbnail, continuousCorners];

function confirmDelete(message: string, onConfirm: () => void, labels: readonly [string, string]) {
  // The web build has no native alert, so it asks through the browser.
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert(message, undefined, [
    { text: labels[0], style: 'cancel' },
    { text: labels[1], style: 'destructive', onPress: onConfirm },
  ]);
}

function ActionButton({
  testID,
  label,
  onPress,
  isBusy,
  isDestructive = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isBusy: boolean;
  readonly isDestructive?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isBusy={isBusy}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md border bg-white px-md ${
        isDestructive ? 'border-error' : 'border-neutral-300'
      }`}
    >
      <Text
        className={`text-center text-md font-semibold ${
          isDestructive ? 'text-error' : 'text-primary-dark'
        } ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

function ReportCard({
  row,
  categories,
  language,
  date,
  busyKey,
  onRequest,
  onContact,
}: {
  readonly row: ForumModerationQueueRow;
  readonly categories: readonly ForumCategoryRow[];
  readonly language: SupportedLanguage;
  readonly date: string;
  readonly busyKey: string | null;
  readonly onRequest: (row: ForumModerationQueueRow, request: ForumModerationRequest) => void;
  readonly onContact: ((row: ForumModerationQueueRow) => void) | null;
}) {
  const { t } = useTranslation('forum');
  const { t: tProfile } = useTranslation('profile');
  const fontClass = useLanguageFontClass();
  const { session } = useAuth();
  const key = moderationKey(row);
  const category = categories.find((candidate) => candidate.id === row.category_id);
  const categoryName =
    category === undefined
      ? t('moderationUnknownCategory')
      : (resolveLocalizedText(category.name, language)?.text ?? category.slug);
  const thumbnail =
    row.target_type === 'media'
      ? resolveMediaImageSource({
          objectKeyOrUrl: row.media_thumbnail_url,
          mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
          accessToken: session?.access_token,
        })
      : null;
  const busy = (action: string) => busyKey === `${key}:${action}`;

  return (
    <View
      testID={`forum-report-${row.target_type}-${row.target_id}`}
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <View className="flex-row flex-wrap items-center gap-sm">
        <View className="rounded-full bg-error px-sm py-xs">
          <Text className={`text-sm font-semibold text-white ${fontClass}`}>
            {t('moderationFlags', { count: row.flag_count })}
          </Text>
        </View>
        <View className="rounded-full border border-neutral-300 px-sm py-xs">
          <Text className={`text-sm font-medium text-neutral-800 ${fontClass}`}>
            {t(`moderationTarget.${row.target_type}`)}
          </Text>
        </View>
        {row.target_type === 'media' ? null : (
          <View className="rounded-full bg-neutral-100 px-sm py-xs">
            <Text className={`text-sm font-medium text-neutral-800 ${fontClass}`}>
              {categoryName}
            </Text>
          </View>
        )}
      </View>
      <View className="gap-xs">
        <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
          {row.author_first_name}
        </Text>
        <Text className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}>
          {date}
        </Text>
      </View>
      <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
        {row.content ?? t('deletedTombstone')}
      </Text>
      {thumbnail === null ? null : (
        <View className="overflow-hidden rounded-md" style={thumbnailStyle}>
          <Image
            source={thumbnail}
            accessibilityLabel={row.content ?? t('moderationTarget.media')}
            contentFit="contain"
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
      <View className="gap-xs">
        <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
          {`${t('moderationReasons')}: ${row.reasons
            .map((reason) => t(`flagReasons.${reason}`))
            .join(', ')}`}
        </Text>
        {row.comments.map((comment, index) => (
          <Text
            key={`${key}:comment:${index}`}
            className={`border-s-2 border-neutral-300 ps-sm text-start text-sm text-neutral-700 ${fontClass}`}
          >
            {comment}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <ActionButton
          testID={`forum-report-dismiss-${row.target_id}`}
          label={t('moderationDismiss')}
          isBusy={busy('dismiss')}
          onPress={() => onRequest(row, { kind: 'moderate', action: 'dismiss' })}
        />
        <ActionButton
          testID={`forum-report-hide-${row.target_id}`}
          label={t('moderationHide')}
          isBusy={busy('hide')}
          onPress={() => onRequest(row, { kind: 'moderate', action: 'hide' })}
        />
        <ActionButton
          testID={`forum-report-delete-${row.target_id}`}
          label={t('moderationDelete')}
          isBusy={busy('delete')}
          isDestructive
          onPress={() =>
            confirmDelete(
              t('moderationDeleteConfirm'),
              () => onRequest(row, { kind: 'moderate', action: 'delete' }),
              [tProfile('cancelAction'), t('moderationDelete')],
            )
          }
        />
        {onContact === null ? null : (
          <ActionButton
            testID={`forum-report-contact-${row.target_id}`}
            label={t('moderationContact')}
            isBusy={busy('contact')}
            onPress={() => onContact(row)}
          />
        )}
      </View>
      {row.target_type === 'post' ? (
        <View className="gap-sm">
          <View className="flex-row">
            <ActionButton
              testID={`forum-report-pin-${row.target_id}`}
              label={row.is_pinned ? t('moderationUnpin') : t('moderationPin')}
              isBusy={busy('pin')}
              onPress={() => onRequest(row, { kind: 'pin', pinned: !row.is_pinned })}
            />
          </View>
          <Text className={`text-start text-sm font-medium text-neutral-800 ${fontClass}`}>
            {t('moderationCategory')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-sm">
              {categories.map((candidate) => (
                <ChoiceOption
                  key={candidate.id}
                  testID={`forum-report-category-${row.target_id}-${candidate.slug}`}
                  value={candidate.id}
                  label={resolveLocalizedText(candidate.name, language)?.text ?? candidate.slug}
                  selected={candidate.id === row.category_id}
                  onSelect={(categoryId) => onRequest(row, { kind: 'category', categoryId })}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export default function ForumModerationScreen() {
  const { t, i18n } = useTranslation('forum');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const canContact = useAccountAccess().permissions.has('messages.inbox');
  const queue = useForumModerationQueue();
  const categories = useForumModerationCategories();
  const { act, contact } = useForumModerationActions();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [language],
  );
  const rows = queue.data ?? [];

  const request = (row: ForumModerationQueueRow, next: ForumModerationRequest) => {
    const action = next.kind === 'moderate' ? next.action : next.kind;
    setBusyKey(`${moderationKey(row)}:${action}`);
    setHasFailed(false);
    act.mutate(
      { row, request: next },
      {
        onSuccess: () => playHaptic('success'),
        onError: () => {
          playHaptic('error');
          setHasFailed(true);
        },
        onSettled: () => setBusyKey(null),
      },
    );
  };
  const contactAuthor = (row: ForumModerationQueueRow) => {
    setBusyKey(`${moderationKey(row)}:contact`);
    setHasFailed(false);
    contact.mutate(row.author_id, {
      onSuccess: (conversationId) => push(`/messages/${conversationId}` as Href),
      onError: () => setHasFailed(true),
      onSettled: () => setBusyKey(null),
    });
  };

  return (
    <SafeAreaView
      testID="forum-moderation"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="forum-moderation-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('moderationTitle')}
            </Text>
            {queue.isSuccess ? (
              <Text
                testID="forum-moderation-total"
                className={`text-start text-md text-neutral-600 ${fontClass}`}
              >
                {t('moderationCount', { count: rows.length })}
              </Text>
            ) : null}
          </View>
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
          {hasFailed ? (
            <Text
              accessibilityLiveRegion="polite"
              className={`text-start text-sm text-error ${fontClass}`}
            >
              {t('moderationActionFailed')}
            </Text>
          ) : null}
          {queue.isPending ? (
            <AnnouncementFeedSkeleton accessibilityLabel={t('moderationTitle')} />
          ) : queue.isError ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>
              {t('moderationActionFailed')}
            </Text>
          ) : rows.length === 0 ? (
            <View className="gap-xs py-xl">
              <Text className={`text-center text-lg font-semibold text-neutral-900 ${fontClass}`}>
                {t('moderationEmptyTitle')}
              </Text>
              <Text className={`text-center text-md text-neutral-600 ${fontClass}`}>
                {t('moderationEmptyBody')}
              </Text>
            </View>
          ) : (
            <View className="gap-md">
              {rows.map((row) => (
                <ReportCard
                  key={moderationKey(row)}
                  row={row}
                  categories={categories.data ?? []}
                  language={language}
                  date={format.format(new Date(row.first_flagged_at))}
                  busyKey={busyKey}
                  onRequest={request}
                  onContact={canContact ? contactAuthor : null}
                />
              ))}
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

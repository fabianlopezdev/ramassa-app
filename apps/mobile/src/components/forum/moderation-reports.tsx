/**
 * A list of reported content with the team's actions (RAPP-380), for one
 * segment of the moderation screen (RAPP-802): the forum's posts and replies,
 * or the gallery's photos. The author can be contacted by whoever has the
 * inbox.
 */
import { playHaptic } from '@/lib/haptics/haptics';
import {
  moderationKey,
  useForumModerationActions,
  type ForumModerationRequest,
} from '@/lib/team-forum';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import type { ForumCategoryRow, ForumModerationQueueRow } from '@ramassa/shared/forum';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@ramassa/shared/i18n';
import { ModerationReportCard } from './moderation-report-card';

export function ModerationReports({
  rows,
  categories,
}: {
  readonly rows: readonly ForumModerationQueueRow[];
  readonly categories: readonly ForumCategoryRow[];
}) {
  const { t, i18n } = useTranslation('forum');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const canContact = useAccountAccess().permissions.has('messages.inbox');
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
    <View className="gap-md">
      {hasFailed ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${fontClass}`}
        >
          {t('moderationActionFailed')}
        </Text>
      ) : null}
      {rows.map((row) => (
        <ModerationReportCard
          key={moderationKey(row)}
          row={row}
          categories={categories}
          language={language}
          date={format.format(new Date(row.first_flagged_at))}
          busyKey={busyKey}
          onRequest={request}
          onContact={canContact ? contactAuthor : null}
        />
      ))}
    </View>
  );
}

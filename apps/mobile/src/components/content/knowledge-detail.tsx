/**
 * One knowledge resource for the team (RAPP-343): its status, type, category
 * and author, the blocks as a player reads them, a story's photos and its
 * recorded publication consent, and the reviewer's note. Edit opens the block
 * editor. A story sent for review gets Start review here, as in the web
 * admin's list. Deleting is for `knowledge.publish` holders, as the database
 * requires, and asks first. A screen of its own on a phone; the right half of
 * the list on a tablet.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { FailureNotice } from '@/components/error-code-line';
import { PlayerStructuredContent } from '@/components/knowledge/player-structured-content';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useContentKnowledgeArticle, useKnowledgeActions } from '@/lib/content-knowledge';
import { composeContinuousViewStyle, continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE, LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';
import { resolveLocalizedKnowledgeBlocks } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';
import { KNOWLEDGE_TYPE_KEYS, knowledgeStatusKey, knowledgeTitle } from './knowledge-labels';

const styles = StyleSheet.create({
  imageFrame: { width: '100%', height: tokens.contentWidth.form / 2 },
  image: { width: '100%', height: '100%' },
});
const imageFrameStyle = composeContinuousViewStyle(styles.imageFrame);

export function KnowledgeDetail({
  articleId,
  onBack,
  onDeleted,
}: {
  readonly articleId: string;
  readonly onBack?: () => void;
  readonly onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation('knowledge');
  const { t: tCommon } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { t: tAnnouncements } = useTranslation('announcements');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const canPublish = useAccountAccess().permissions.has('knowledge.publish');
  const { session } = useAuth();
  const { push } = useRouter();
  const article = useContentKnowledgeArticle(articleId);
  const { transition, remove } = useKnowledgeActions();
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.resolvedLanguage],
  );

  if (article.isPending) return <AnnouncementFeedSkeleton accessibilityLabel={t('title')} />;
  if (article.isError) {
    return (
      <AnnouncementFeedError
        message={t('playerLoadFailed')}
        retryLabel={tErrors('retry')}
        code={toAppError(article.error).code}
        languageFontClass={fontClass}
        onRetry={() => void article.refetch()}
        isLoading={article.isFetching}
      />
    );
  }
  const data = article.data;
  if (data === undefined) {
    return (
      <AnnouncementEmptyState title={t('playerLoadFailed')} body="" languageFontClass={fontClass} />
    );
  }

  const title = knowledgeTitle(data);
  const blocks = resolveLocalizedKnowledgeBlocks(data.body, data.submission_language ?? 'ca');
  const failure = transition.error ?? remove.error;
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
    Alert.alert(t('deleteConfirm'), title, [
      { text: tProfile('cancelAction'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: done },
    ]);
  };

  return (
    <ScrollView contentContainerClassName="gap-md p-lg" testID="knowledge-detail">
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
          {title || t('contentUnavailable')}
        </Text>
        <Text
          testID="knowledge-detail-status"
          className={`text-start text-sm font-semibold text-neutral-700 ${fontClass}`}
        >
          {t(knowledgeStatusKey(data))}
        </Text>
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {[
            data.category.name.ca,
            t(KNOWLEDGE_TYPE_KEYS[data.content_type]),
            data.author_first_name === null
              ? null
              : t('participantAttribution', { name: data.author_first_name }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <PressableScale
          testID="knowledge-edit"
          accessibilityRole="button"
          accessibilityLabel={t('editTitle')}
          onPress={() => push(`/content-knowledge-edit/${data.id}` as Href)}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {tAnnouncements('editAction')}
          </Text>
        </PressableScale>
        {data.story_status === 'submitted' ? (
          <PressableScale
            testID="knowledge-start-review"
            accessibilityRole="button"
            accessibilityLabel={t('startReview')}
            onPress={() =>
              transition.mutate(
                { id: data.id, from: 'submitted', to: 'in_review', reviewerNote: null },
                { onSuccess: () => playHaptic('success') },
              )
            }
            isBusy={transition.isPending}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-primary bg-white px-lg"
          >
            <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
              {t('startReview')}
            </Text>
          </PressableScale>
        ) : null}
        {canPublish ? (
          <PressableScale
            testID="knowledge-delete"
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
      {failure === null ? null : (
        <FailureNotice
          code={toAppError(failure).code}
          message={tErrors(getErrorMessageKey(toAppError(failure).code))}
        />
      )}
      {data.reviewer_note === null ? null : (
        <View
          style={continuousCorners}
          className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
        >
          <Text className={`text-start text-sm text-neutral-500 ${fontClass}`}>
            {t('reviewerNote')}
          </Text>
          <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
            {data.reviewer_note}
          </Text>
        </View>
      )}
      {data.content_type === 'participant_story' && data.publication_consent === true ? (
        <View
          testID="knowledge-detail-consent"
          style={continuousCorners}
          className="gap-xs rounded-md border border-neutral-200 bg-neutral-50 p-md"
        >
          <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
            {t('consentRecorded')}
          </Text>
          <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
            {t('consentRecordedDetail', {
              language:
                data.submission_language === null
                  ? ''
                  : LANGUAGE_NATIVE_NAMES[data.submission_language],
              date:
                data.publication_consent_at === null
                  ? ''
                  : format.format(new Date(data.publication_consent_at)),
              version: data.publication_consent_version ?? '',
            })}
          </Text>
        </View>
      ) : null}
      {blocks === undefined ? null : (
        <PlayerStructuredContent
          blocks={blocks.blocks}
          videoUrl={data.video_url}
          title={title}
          accessToken={session?.access_token}
          unavailableLabel={t('contentUnavailable')}
        />
      )}
      {data.external_url === null ? null : (
        <Text selectable className={`text-start text-sm text-neutral-700 ${fontClass}`}>
          {`${t('fieldExternal')}: ${data.external_url}`}
        </Text>
      )}
      {data.story_image_urls.map((objectKey, index) => {
        const source = resolveMediaImageSource({
          objectKeyOrUrl: objectKey,
          mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
          accessToken: session?.access_token,
        });
        return source === null ? null : (
          <View key={objectKey} className="overflow-hidden rounded-md" style={imageFrameStyle}>
            <Image
              source={source}
              accessibilityLabel={t('storyPhoto', { number: index + 1, title })}
              cachePolicy="memory-disk"
              contentFit="cover"
              style={styles.image}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

/**
 * The review of a participant story, on its detail (RAPP-801): Start review
 * while it waits, then the three outcomes together (Publish, Request changes,
 * Decline) with the note she reads. Publishing needs `knowledge.publish` and
 * every version approved in the editor; the database checks the rest.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useKnowledgeActions } from '@/lib/content-knowledge';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { storyPublicationInput } from '@/lib/knowledge-draft';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';
import {
  MAX_KNOWLEDGE_REVIEWER_NOTE_LENGTH,
  type KnowledgeArticleListRow,
} from '@ramassa/shared/knowledge';

const outlineButton =
  'min-h-recommended flex-1 items-center justify-center rounded-md border bg-white px-lg';

export function StoryReviewActions({ article }: { readonly article: KnowledgeArticleListRow }) {
  const { t } = useTranslation('knowledge');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const canPublish = useAccountAccess().permissions.has('knowledge.publish');
  const { transition, publish } = useKnowledgeActions();
  const [note, setNote] = useState(article.reviewer_note ?? '');
  const [isMissingVersions, setIsMissingVersions] = useState(false);
  const isBusy = transition.isPending || publish.isPending;
  const failure = transition.error ?? publish.error;

  if (article.content_type !== 'participant_story') return null;
  if (article.story_status !== 'submitted' && article.story_status !== 'in_review') return null;

  const complete = (to: 'changes_requested' | 'rejected') => {
    setIsMissingVersions(false);
    transition.mutate(
      { id: article.id, from: 'in_review', to, reviewerNote: note.trim() || null },
      { onSuccess: () => playHaptic('success') },
    );
  };
  const publishNow = () => {
    const values = storyPublicationInput(article, note);
    if (values === null) {
      setIsMissingVersions(true);
      playHaptic('warning');
      return;
    }
    setIsMissingVersions(false);
    publish.mutate({ id: article.id, values }, { onSuccess: () => playHaptic('success') });
  };

  if (article.story_status === 'submitted') {
    return (
      <View className="gap-sm" testID="knowledge-review">
        <PressableScale
          testID="knowledge-start-review"
          accessibilityRole="button"
          accessibilityLabel={t('startReview')}
          onPress={() =>
            transition.mutate(
              { id: article.id, from: 'submitted', to: 'in_review', reviewerNote: null },
              { onSuccess: () => playHaptic('success') },
            )
          }
          isBusy={transition.isPending}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {t('startReview')}
          </Text>
        </PressableScale>
        {failure === null ? null : (
          <FailureNotice
            code={toAppError(failure).code}
            message={tErrors(getErrorMessageKey(toAppError(failure).code))}
          />
        )}
      </View>
    );
  }

  return (
    <View
      testID="knowledge-review"
      style={continuousCorners}
      className="gap-sm rounded-md border border-neutral-200 bg-white p-md"
    >
      <AuthTextField
        testID="knowledge-reviewer-note"
        label={t('reviewerNote')}
        value={note}
        onChangeText={setNote}
        maxLength={MAX_KNOWLEDGE_REVIEWER_NOTE_LENGTH}
        multiline
      />
      {canPublish ? (
        <PressableScale
          testID="knowledge-publish"
          accessibilityRole="button"
          accessibilityLabel={t('publish')}
          onPress={publishNow}
          isBusy={publish.isPending}
          isDisabled={isBusy}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {t('publish')}
          </Text>
        </PressableScale>
      ) : null}
      <View className="flex-row gap-sm">
        <PressableScale
          testID="knowledge-request-changes"
          accessibilityRole="button"
          accessibilityLabel={t('requestChanges')}
          onPress={() => complete('changes_requested')}
          isDisabled={isBusy}
          haptic="tapLight"
          style={continuousCorners}
          className={`${outlineButton} border-primary`}
        >
          <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
            {t('requestChanges')}
          </Text>
        </PressableScale>
        <PressableScale
          testID="knowledge-decline"
          accessibilityRole="button"
          accessibilityLabel={t('decline')}
          onPress={() => complete('rejected')}
          isDisabled={isBusy}
          haptic="tapLight"
          style={continuousCorners}
          className={`${outlineButton} border-error`}
        >
          <Text className={`text-center text-md font-bold text-error ${fontClass}`}>
            {t('decline')}
          </Text>
        </PressableScale>
      </View>
      {isMissingVersions ? (
        <FailureNotice code="TRANSLATION-4" message={t('translationRequired')} />
      ) : null}
      {failure === null ? null : (
        <FailureNotice
          code={toAppError(failure).code}
          message={tErrors(getErrorMessageKey(toAppError(failure).code))}
        />
      )}
    </View>
  );
}

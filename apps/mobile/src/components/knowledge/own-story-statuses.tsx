/**
 * Her own stories that are not published yet, at the top of Comunitat ·
 * Històries (RAPP-890): each with its status, the day she sent it, the team's
 * note, and the edit action when the team asked for changes. A published story
 * already sits in the list below, and with nothing pending the section is not
 * drawn at all.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { OpenableCard } from '@/components/layout/openable-card';
import { ScreenSection } from '@/components/layout/screen-section';
import { continuousCorners } from '@/lib/continuous-corners';
import { useOwnParticipantStoryStatuses } from '@/lib/player-knowledge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import {
  participantStoryEditableDraft,
  type ParticipantStoryStatusRow,
  type StoryStatus,
} from '@ramassa/shared/knowledge';

/** The team's note on her story; the share form shows it again while she edits. */
export function StoryTeamNote({
  testID,
  note,
}: {
  readonly testID: string;
  readonly note: string;
}) {
  const { t } = useTranslation('knowledge');
  const languageFontClass = useLanguageFontClass();
  return (
    <View testID={testID} className="gap-xs rounded-md bg-white p-sm" style={continuousCorners}>
      <Text className={`text-start text-sm font-bold text-neutral-800 ${languageFontClass}`}>
        {t('knowledge:storyTeamNote')}
      </Text>
      <Text selectable className={`text-start text-md text-neutral-800 ${languageFontClass}`}>
        {note}
      </Text>
    </View>
  );
}

function statusTranslationKey(status: StoryStatus) {
  if (status === 'in_review') return 'knowledge:storyStatusInReview' as const;
  if (status === 'changes_requested') return 'knowledge:storyStatusChangesRequested' as const;
  if (status === 'published') return 'knowledge:storyStatusPublished' as const;
  if (status === 'rejected') return 'knowledge:storyStatusRejected' as const;
  return 'knowledge:storyStatusSubmitted' as const;
}

const EMPTY_STATUSES: readonly ParticipantStoryStatusRow[] = [];

export function OwnStoryStatuses() {
  const { t, i18n } = useTranslation('knowledge');
  const { push } = useRouter();
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const statusesQuery = useOwnParticipantStoryStatuses();
  const pendingStories = useMemo(
    () =>
      (statusesQuery.data ?? EMPTY_STATUSES).filter(
        (status) => status.story_status !== 'published',
      ),
    [statusesQuery.data],
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', { dateStyle: 'medium' }),
    [i18n.resolvedLanguage],
  );
  if (pendingStories.length === 0) return null;

  return (
    <ScreenSection testID="own-story-statuses" title={t('knowledge:myStories')}>
      {pendingStories.map((status) => {
        const storyTitle = resolveLocalizedText(status.title, language)?.text ?? '';
        const statusLabel = t(statusTranslationKey(status.story_status));
        const note = status.reviewer_note?.trim() ?? '';
        const isEditable = participantStoryEditableDraft(status) !== null;
        return (
          <View key={status.id} className="gap-xs">
            <OpenableCard
              testID={`story-status-${status.story_status}`}
              accessibilityLabel={[storyTitle, statusLabel, note].filter(Boolean).join('. ')}
              onOpen={() => push(`/knowledge/${status.id}` as Href)}
            >
              <Text
                className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}
              >
                {storyTitle}
              </Text>
              <Text className={`text-start text-sm font-medium text-primary ${languageFontClass}`}>
                {statusLabel}
              </Text>
              <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                {t('knowledge:storySubmittedDate', {
                  date: dateFormatter.format(new Date(status.created_at)),
                })}
              </Text>
              {note.length === 0 ? null : (
                <StoryTeamNote testID={`story-team-note-${status.id}`} note={note} />
              )}
            </OpenableCard>
            {isEditable ? (
              <RaisedActionButton
                testID={`story-edit-${status.id}`}
                icon="pen"
                label={t('knowledge:editStory')}
                onPress={() =>
                  push({
                    pathname: '/story/submit',
                    params: { edit: status.id },
                  } as unknown as Href)
                }
              />
            ) : null}
          </View>
        );
      })}
    </ScreenSection>
  );
}

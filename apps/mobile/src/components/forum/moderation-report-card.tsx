/**
 * One reported post, reply or gallery photo (RAPP-380), with its reports,
 * reasons and comments and the team's actions on it. Delete asks first. Next
 * to "Contacta l'autora", a `forum.moderate` holder can switch the author's
 * forum posting off or on (RAPP-802), with the participant card's own write.
 */
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { confirmDelete } from '@/lib/confirm-delete';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { useParticipantWrites } from '@/lib/participant-lookup';
import { mobileClientEnv } from '@/lib/supabase';
import {
  moderationKey,
  useAuthorForumPosting,
  type ForumModerationRequest,
} from '@/lib/team-forum';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import type { ForumCategoryRow, ForumModerationQueueRow } from '@ramassa/shared/forum';
import { resolveLocalizedText, type SupportedLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  thumbnail: { width: '100%', height: tokens.contentWidth.form / 2 },
});
const thumbnailStyle = [styles.thumbnail, continuousCorners];

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

export function ModerationReportCard({
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
  const canModerateForum = useAccountAccess().permissions.has('forum.moderate');
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
        {canModerateForum ? <AuthorPostingAction row={row} /> : null}
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

/** Her forum posting, switched off or on from the report, for a player author only. */
function AuthorPostingAction({ row }: { readonly row: ForumModerationQueueRow }) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  const status = useAuthorForumPosting(row.author_id);
  const { setForumPosting } = useParticipantWrites(row.author_id);
  // Only a player's forum posting can be switched; the database refuses anyone else.
  if (status.data === undefined || !status.data.isPlayer) return null;
  const { isBanned } = status.data;
  return (
    <>
      <ActionButton
        testID={`forum-report-posting-${row.target_id}`}
        label={isBanned ? t('forumPostingEnableAction') : t('forumPostingDisableAction')}
        isBusy={setForumPosting.isPending}
        onPress={() =>
          setForumPosting.mutate(!isBanned, {
            onSuccess: () => playHaptic('success'),
            onError: () => playHaptic('error'),
          })
        }
      />
      {setForumPosting.isError ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`w-full text-start text-sm text-error ${fontClass}`}
        >
          {t('forumPostingStatusChangeFailed')}
        </Text>
      ) : null}
    </>
  );
}

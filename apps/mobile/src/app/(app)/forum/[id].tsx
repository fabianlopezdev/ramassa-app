import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ErrorCodeLine } from '@/components/error-code-line';
import { ForumFlagDialog } from '@/components/forum/forum-flag-dialog';
import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { ForumReplyCard } from '@/components/forum/forum-reply-card';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { isNetworkStateOnline } from '@/lib/network-status';
import {
  useCreateForumReply,
  useDeleteForumPost,
  useEditForumPost,
  useForumPost,
  useForumReplies,
  useOwnForumPostingStatus,
} from '@/lib/player-forum';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import type { ForumFlagTargetType, ForumReplyRow } from '@ramassa/shared/forum';
import { FORUM_POST_MAX_LENGTH, FORUM_REPLY_MAX_LENGTH } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  image: { width: '100%', height: tokens.spacing['3xl'] * 4 },
  replyInput: { minHeight: tokens.spacing['2xl'] },
});
const replyKeyExtractor = (reply: ForumReplyRow) => reply.id;

export default function ForumPostDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const postId = typeof id === 'string' ? id : undefined;
  const { back } = useRouter();
  const { t } = useTranslation(['forum', 'common']);
  const { user, session } = useAuth();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const postQuery = useForumPost(postId);
  const repliesQuery = useForumReplies(postId);
  const createReply = useCreateForumReply(postId);
  const editPost = useEditForumPost(postId);
  const deletePost = useDeleteForumPost(postId);
  const postingStatus = useOwnForumPostingStatus();
  const [reply, setReply] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [localErrorCode, setLocalErrorCode] = useState<AppErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<{
    readonly targetType: ForumFlagTargetType;
    readonly targetId: string;
  } | null>(null);
  const insets = useSafeAreaInsets();
  const post = postQuery.data;
  const isOwnPost =
    post !== undefined && post.author_id === user?.id && post.visibility === 'visible';
  const mutationError = createReply.error ?? editPost.error ?? deletePost.error;
  const mutationErrorCode = mutationError === null ? null : toAppError(mutationError).code;
  const errorCode = localErrorCode ?? mutationErrorCode;
  const postingDisabled = postingStatus.data === true;
  const imageSource = resolveMediaImageSource({
    objectKeyOrUrl: post?.image_url ?? null,
    mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
    accessToken: session?.access_token,
  });
  const contentStyle = useMemo(
    () => ({
      paddingHorizontal: tokens.spacing.lg,
      paddingTop:
        process.env.EXPO_OS === 'android' ? insets.top + tokens.spacing.lg : tokens.spacing.lg,
      paddingBottom: insets.bottom + tokens.spacing['3xl'],
    }),
    [insets.bottom, insets.top],
  );
  const openLinkLabel = useCallback((url: string) => t('forum:openLink', { url }), [t]);
  const refresh = useCallback(() => {
    void Promise.all([postQuery.refetch(), repliesQuery.refetch()]);
  }, [postQuery, repliesQuery]);

  const beginEdit = useCallback(() => {
    setEditContent(post?.content ?? '');
    setIsEditing(true);
    setLocalErrorCode(null);
    setErrorMessage(null);
  }, [post?.content]);
  const cancelEdit = useCallback(() => setIsEditing(false), []);
  const saveEdit = useCallback(async () => {
    if (editContent.trim().length === 0) {
      setLocalErrorCode('VALIDATION-1');
      setErrorMessage(t('forum:contentRequired'));
      return;
    }
    setLocalErrorCode(null);
    setErrorMessage(null);
    try {
      await editPost.mutateAsync(editContent);
      setIsEditing(false);
    } catch {
      setErrorMessage(t('forum:publishFailed'));
    }
  }, [editContent, editPost, t]);
  const confirmDelete = useCallback(() => setIsConfirmingDelete(true), []);
  const cancelDelete = useCallback(() => setIsConfirmingDelete(false), []);
  const performDelete = useCallback(async () => {
    setLocalErrorCode(null);
    setErrorMessage(null);
    try {
      await deletePost.mutateAsync();
      setIsConfirmingDelete(false);
    } catch {
      setErrorMessage(t('forum:deleteFailed'));
    }
  }, [deletePost, t]);
  const submitReply = useCallback(async () => {
    if (reply.trim().length === 0) {
      setLocalErrorCode('VALIDATION-1');
      setErrorMessage(t('forum:contentRequired'));
      return;
    }
    setLocalErrorCode(null);
    setErrorMessage(null);
    try {
      await createReply.mutateAsync(reply);
      setReply('');
    } catch {
      setErrorMessage(t('forum:replyFailed'));
    }
  }, [createReply, reply, t]);
  const renderReply = useCallback(
    ({ item }: ListRenderItemInfo<ForumReplyRow>) => (
      <View className="gap-sm pb-md">
        <ForumReplyCard
          reply={item}
          authorLabel={t('forum:postBy', { name: item.author_first_name })}
          tombstone={t('forum:deletedTombstone')}
          languageFontClass={languageFontClass}
          openLinkLabel={openLinkLabel}
        />
        {item.author_id === user?.id || item.visibility !== 'visible' ? null : (
          <PressableScale
            testID={`forum-flag-reply-${item.id}`}
            accessibilityLabel={t('forum:flagReply')}
            onPress={() => setFlagTarget({ targetType: 'reply', targetId: item.id })}
            haptic="warning"
            isDisabled={!isOnline}
            className="min-h-recommended self-start justify-center rounded-md border border-neutral-300 px-lg"
          >
            <Text className={`font-semibold text-neutral-700 ${languageFontClass}`}>
              {t('forum:flag')}
            </Text>
          </PressableScale>
        )}
      </View>
    ),
    [isOnline, languageFontClass, openLinkLabel, t, user?.id],
  );

  const confirmFlag = useCallback(() => {
    setFlagTarget(null);
    Alert.alert(t('forum:flagConfirmationTitle'), t('forum:flagConfirmation'));
    back();
  }, [back, t]);

  if (postQuery.isPending && post === undefined) {
    return (
      <SafeAreaView style={styles.screen}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            accessibilityRole="progressbar"
            accessibilityLabel={t('forum:loading')}
          />
        </View>
      </SafeAreaView>
    );
  }
  if (post === undefined) {
    const loadCode = postQuery.error === null ? 'DB-1' : toAppError(postQuery.error).code;
    return (
      <SafeAreaView style={styles.screen}>
        <View className="flex-1 items-center justify-center gap-md px-lg">
          <Text
            accessibilityRole="alert"
            className={`text-center text-neutral-700 ${languageFontClass}`}
          >
            {t('forum:loadFailed')}
          </Text>
          <ErrorCodeLine code={loadCode} />
          <PressableScale
            accessibilityLabel={t('forum:retry')}
            onPress={() => void postQuery.refetch()}
            haptic="tapLight"
            className="min-h-recommended justify-center rounded-md bg-primary px-lg"
          >
            <Text className={`font-bold text-white ${languageFontClass}`}>{t('forum:retry')}</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <FlashList
        testID="forum-detail-screen"
        accessibilityRole="list"
        accessibilityLabel={t('forum:detailTitle')}
        data={repliesQuery.data ?? []}
        renderItem={renderReply}
        keyExtractor={replyKeyExtractor}
        style={styles.screen}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={(postQuery.isRefetching || repliesQuery.isRefetching) && isOnline}
        onRefresh={refresh}
        ListHeaderComponent={
          <PageWidth className="gap-lg pb-lg">
            <PressableScale
              testID="forum-detail-back"
              accessibilityLabel={t('common:back')}
              onPress={back}
              haptic="tapLight"
              className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
            >
              <Text className={`font-medium text-primary ${languageFontClass}`}>
                {t('common:back')}
              </Text>
            </PressableScale>
            <View className="gap-xs">
              <Text
                accessibilityRole="header"
                className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('forum:detailTitle')}
              </Text>
              <Text
                className={`text-start text-sm font-bold text-primary-dark ${languageFontClass}`}
              >
                {t('forum:postBy', { name: post.author_first_name })}
              </Text>
            </View>
            {imageSource === null ? null : (
              <Image
                source={imageSource}
                accessibilityLabel={t('forum:imageAlt', { name: post.author_first_name })}
                contentFit="cover"
                cachePolicy="memory-disk"
                style={styles.image}
              />
            )}
            {post.content === null ? (
              <Text
                accessibilityRole="text"
                className={`text-start text-md italic text-neutral-600 ${languageFontClass}`}
              >
                {t('forum:deletedTombstone')}
              </Text>
            ) : isEditing ? (
              <View className="gap-sm">
                <AuthTextField
                  testID="forum-edit-content"
                  label={t('forum:editTitle')}
                  value={editContent}
                  onChangeText={setEditContent}
                  maxLength={FORUM_POST_MAX_LENGTH}
                  multiline
                  textAlignVertical="top"
                />
                <View className="flex-row gap-sm">
                  <PressableScale
                    accessibilityLabel={t('forum:cancel')}
                    onPress={cancelEdit}
                    haptic="tapLight"
                    className="min-h-recommended grow items-center justify-center rounded-md border border-neutral-300 px-lg"
                  >
                    <Text className={`font-bold text-neutral-700 ${languageFontClass}`}>
                      {t('forum:cancel')}
                    </Text>
                  </PressableScale>
                  <PressableScale
                    testID="forum-save-edit"
                    accessibilityLabel={t('forum:save')}
                    onPress={() => void saveEdit()}
                    haptic="tapLight"
                    isBusy={editPost.isPending}
                    isDisabled={!isOnline}
                    className="min-h-recommended grow items-center justify-center rounded-md bg-primary px-lg"
                  >
                    <Text className={`font-bold text-white ${languageFontClass}`}>
                      {editPost.isPending ? t('forum:saving') : t('forum:save')}
                    </Text>
                  </PressableScale>
                </View>
              </View>
            ) : (
              <ForumPlainText
                content={post.content}
                languageFontClass={languageFontClass}
                openLinkLabel={openLinkLabel}
              />
            )}
            {isOwnPost && !isEditing && !isConfirmingDelete ? (
              <View className="flex-row gap-sm">
                <PressableScale
                  testID="forum-edit"
                  accessibilityLabel={t('forum:edit')}
                  onPress={beginEdit}
                  haptic="tapLight"
                  isDisabled={!isOnline}
                  style={continuousCorners}
                  className="min-h-recommended grow items-center justify-center rounded-md border border-primary px-lg"
                >
                  <Text className={`font-bold text-primary ${languageFontClass}`}>
                    {t('forum:edit')}
                  </Text>
                </PressableScale>
                <PressableScale
                  testID="forum-delete"
                  accessibilityLabel={t('forum:delete')}
                  onPress={confirmDelete}
                  haptic="warning"
                  isDisabled={!isOnline}
                  isBusy={deletePost.isPending}
                  style={continuousCorners}
                  className="min-h-recommended grow items-center justify-center rounded-md border border-error px-lg"
                >
                  <Text className={`font-bold text-error ${languageFontClass}`}>
                    {t('forum:delete')}
                  </Text>
                </PressableScale>
              </View>
            ) : null}
            {isOwnPost || post.visibility !== 'visible' ? null : (
              <PressableScale
                testID="forum-flag-post"
                accessibilityLabel={t('forum:flagPost')}
                onPress={() => setFlagTarget({ targetType: 'post', targetId: post.id })}
                haptic="warning"
                isDisabled={!isOnline}
                className="min-h-recommended self-start justify-center rounded-md border border-neutral-300 px-lg"
              >
                <Text className={`font-semibold text-neutral-700 ${languageFontClass}`}>
                  {t('forum:flag')}
                </Text>
              </PressableScale>
            )}
            {!isConfirmingDelete ? null : (
              <View
                accessibilityRole="alert"
                className="gap-md rounded-lg border border-error bg-white p-md"
                style={continuousCorners}
              >
                <Text
                  accessibilityRole="header"
                  className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
                >
                  {t('forum:deleteConfirmTitle')}
                </Text>
                <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
                  {t('forum:deleteConfirmBody')}
                </Text>
                <View className="flex-row gap-sm">
                  <PressableScale
                    accessibilityLabel={t('forum:cancel')}
                    onPress={cancelDelete}
                    haptic="tapLight"
                    className="min-h-recommended grow items-center justify-center rounded-md border border-neutral-300 px-lg"
                  >
                    <Text className={`font-bold text-neutral-700 ${languageFontClass}`}>
                      {t('forum:cancel')}
                    </Text>
                  </PressableScale>
                  <PressableScale
                    testID="forum-confirm-delete"
                    accessibilityLabel={t('forum:deleteConfirm')}
                    onPress={() => void performDelete()}
                    haptic="warning"
                    isBusy={deletePost.isPending}
                    className="min-h-recommended grow items-center justify-center rounded-md bg-error px-lg"
                  >
                    <Text className={`font-bold text-white ${languageFontClass}`}>
                      {t('forum:deleteConfirm')}
                    </Text>
                  </PressableScale>
                </View>
              </View>
            )}
            {!isOnline ? (
              <Text
                accessibilityRole="alert"
                className={`text-start text-sm text-error ${languageFontClass}`}
              >
                {t('forum:offlineWrite')}
              </Text>
            ) : null}
            <Text
              accessibilityRole="header"
              className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('forum:repliesCount', { count: post.reply_count })}
            </Text>
          </PageWidth>
        }
        ListEmptyComponent={
          <PageWidth>
            <Text className={`pb-lg text-start text-neutral-600 ${languageFontClass}`}>
              {t('forum:noReplies')}
            </Text>
          </PageWidth>
        }
        ListFooterComponent={
          post.visibility === 'deleted' ? null : (
            <PageWidth className="gap-sm pt-md">
              {postingDisabled ? (
                <Text
                  accessibilityRole="alert"
                  className={`text-start text-sm text-neutral-700 ${languageFontClass}`}
                >
                  {t('forum:postingDisabled')}
                </Text>
              ) : null}
              <AuthTextField
                testID="forum-reply-content"
                label={t('forum:reply')}
                placeholder={t('forum:replyPlaceholder')}
                value={reply}
                onChangeText={setReply}
                maxLength={FORUM_REPLY_MAX_LENGTH}
                multiline
                textAlignVertical="top"
                style={styles.replyInput}
                editable={!postingDisabled}
              />
              <Text
                className={`text-end text-sm tabular-nums text-neutral-600 ${languageFontClass}`}
              >
                {t('forum:charactersRemaining', { count: FORUM_REPLY_MAX_LENGTH - reply.length })}
              </Text>
              <ShakeOnError errorCode={errorCode}>
                <View className="gap-sm">
                  {errorMessage === null && mutationErrorCode === null ? null : (
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      className={`text-start text-sm text-error ${languageFontClass}`}
                    >
                      {errorMessage ?? t('forum:replyFailed')}
                    </Text>
                  )}
                  {errorCode === null ? null : <ErrorCodeLine code={errorCode} />}
                  <AuthSubmitButton
                    testID="forum-submit-reply"
                    label={createReply.isPending ? t('forum:replying') : t('forum:reply')}
                    onPress={() => void submitReply()}
                    isLoading={createReply.isPending}
                    disabled={!isOnline || postingDisabled || postingStatus.isPending}
                  />
                </View>
              </ShakeOnError>
            </PageWidth>
          )
        }
      />
      <ForumFlagDialog
        target={flagTarget}
        postId={post.id}
        onClose={() => setFlagTarget(null)}
        onConfirmed={confirmFlag}
      />
    </>
  );
}

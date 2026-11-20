import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ForumFlagDialog } from '@/components/forum/forum-flag-dialog';
import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { ForumThreadMessage } from '@/components/forum/forum-thread-message';
import { Icon } from '@/components/icons/icon';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ActionScreen } from '@/components/layout/screen-action';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { continuousCorners } from '@/lib/continuous-corners';
import { buildReplyThread, threadRows, type ForumThreadRow } from '@/lib/forum-reply-thread';
import { resolveMediaImageSource } from '@/lib/media-source';
import { isNetworkStateOnline } from '@/lib/network-status';
import { usePersonCards } from '@/lib/person-cards';
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
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import type { ForumFlagTargetType, ForumReplyRow } from '@ramassa/shared/forum';
import { FORUM_POST_MAX_LENGTH, FORUM_REPLY_MAX_LENGTH } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const FORUM_DETAIL_IMAGE_HEIGHT = tokens.spacing['3xl'] * 4;
const SAFE_AREA_BOTTOM_EDGES = ['bottom'] as const;
const EMPTY_REPLIES: readonly ForumReplyRow[] = [];
const NO_RAILS = [] as const;
// Where a message she answers lands when the list scrolls to it: its end at
// the bottom of what shows, right above the reply field.
const REVEAL_AT_BOTTOM = 1;
// A new answer lands in the middle of the list, with its context above it.
const REVEAL_IN_MIDDLE = 0.5;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  image: { width: '100%', height: FORUM_DETAIL_IMAGE_HEIGHT },
  mixedDirectionInput: { writingDirection: 'auto' },
  replyInput: { minHeight: tokens.spacing['2xl'], writingDirection: 'auto' },
});
const threadRowKeyExtractor = (row: ForumThreadRow) => row.reply.id;
const threadRowType = (row: ForumThreadRow) => row.level;

/** The message she tapped "Respon" on, and where her answer goes. */
interface ReplyTarget {
  readonly messageId: string;
  readonly name: string;
  /** Null answers the post; an answer to an answer stays on the second level. */
  readonly parentReplyId: string | null;
}

/** What she typed, and for which message, so closing the field keeps it. */
interface ReplyDraft {
  readonly targetId: string | null;
  readonly text: string;
}
const EMPTY_DRAFT: ReplyDraft = { targetId: null, text: '' };

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
  // The post's and the replies' authors in one lookup (RAPP-639).
  const authorIds = useMemo(
    () => [
      postQuery.data?.author_id,
      ...(repliesQuery.data ?? EMPTY_REPLIES).map((row) => row.author_id),
    ],
    [postQuery.data?.author_id, repliesQuery.data],
  );
  const personCards = usePersonCards(authorIds);
  // The answers as one thread, one row per message (RAPP-884).
  const rows = useMemo(
    () => threadRows(buildReplyThread(repliesQuery.data ?? EMPTY_REPLIES)),
    [repliesQuery.data],
  );
  const createReply = useCreateForumReply(postId);
  const editPost = useEditForumPost(postId);
  const deletePost = useDeleteForumPost(postId);
  const postingStatus = useOwnForumPostingStatus();
  const refetchPost = postQuery.refetch;
  const refetchReplies = repliesQuery.refetch;
  const createReplyAsync = createReply.mutateAsync;
  const resetCreateReply = createReply.reset;
  const editPostAsync = editPost.mutateAsync;
  const deletePostAsync = deletePost.mutateAsync;
  const [draft, setDraft] = useState<ReplyDraft>(EMPTY_DRAFT);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [replyErrorCode, setReplyErrorCode] = useState<AppErrorCode | null>(null);
  const [replyErrorMessage, setReplyErrorMessage] = useState<string | null>(null);
  const [postErrorMessage, setPostErrorMessage] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<{
    readonly targetType: ForumFlagTargetType;
    readonly targetId: string;
  } | null>(null);
  const listRef = useRef<FlashListRef<ForumThreadRow>>(null);
  const replyInputRef = useRef<TextInput>(null);
  const headerHeightRef = useRef(0);
  const listHeightRef = useRef(0);
  // The message kept in view above the reply field while it is open.
  const revealIdRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const post = postQuery.data;
  const isOwnPost =
    post !== undefined && post.author_id === user?.id && post.visibility === 'visible';
  const replyMutationCode = createReply.error === null ? null : toAppError(createReply.error).code;
  const postingDisabled = postingStatus.data === true;
  const canReplyHere = post !== undefined && post.visibility !== 'deleted' && !postingDisabled;
  const isReplyDisabled = !isOnline || postingStatus.isPending;
  const imageSource = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: post?.image_url ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken: session?.access_token,
      }),
    [post?.image_url, session?.access_token],
  );
  const contentStyle = useMemo(
    () => ({
      paddingTop: tokens.spacing.lg,
      paddingBottom: insets.bottom + tokens.spacing['3xl'],
    }),
    [insets.bottom],
  );
  const openLinkLabel = useCallback((url: string) => t('forum:openLink', { url }), [t]);
  const flagReply = useCallback(
    (targetId: string) => setFlagTarget({ targetType: 'reply', targetId }),
    [],
  );
  const flagPost = useCallback(
    (targetId: string) => setFlagTarget({ targetType: 'post', targetId }),
    [],
  );
  const refresh = useCallback(() => {
    void Promise.all([refetchPost(), refetchReplies()]);
  }, [refetchPost, refetchReplies]);
  const retryPost = useCallback(() => void refetchPost(), [refetchPost]);
  const retryReplies = useCallback(() => void refetchReplies(), [refetchReplies]);

  // Scrolls the message she answers into view right above the reply field:
  // the post by its measured height, an answer by its row.
  const revealReplyTarget = useCallback(() => {
    const messageId = revealIdRef.current;
    if (messageId === null) return;
    if (messageId === post?.id) {
      const offset = Math.max(0, headerHeightRef.current - listHeightRef.current);
      listRef.current?.scrollToOffset({ offset, animated: true });
      return;
    }
    const index = rows.findIndex((row) => row.reply.id === messageId);
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, viewPosition: REVEAL_AT_BOTTOM, animated: true });
    }
  }, [post?.id, rows]);
  // The list gets shorter as the reply field and then the keyboard open, and
  // as her answer grows; each time, the message she answers is brought back.
  const measureList = useCallback(
    (event: LayoutChangeEvent) => {
      listHeightRef.current = event.nativeEvent.layout.height;
      requestAnimationFrame(revealReplyTarget);
    },
    [revealReplyTarget],
  );
  const measureHeader = useCallback((event: LayoutChangeEvent) => {
    headerHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  const openReply = useCallback(
    (messageId: string) => {
      if (post === undefined) return;
      let target: ReplyTarget;
      if (messageId === post.id) {
        target = { messageId, name: post.author_first_name, parentReplyId: null };
      } else {
        const row = rows.find((candidate) => candidate.reply.id === messageId);
        if (row === undefined) return;
        target = {
          messageId,
          name: row.reply.author_first_name,
          parentReplyId: row.level === 1 ? row.reply.id : row.reply.parent_reply_id,
        };
      }
      // Her draft stays with the message she began it for.
      setDraft((current) =>
        current.targetId === messageId ? current : { targetId: messageId, text: '' },
      );
      setReplyErrorCode(null);
      setReplyErrorMessage(null);
      resetCreateReply();
      setReplyTarget(target);
      revealIdRef.current = messageId;
      replyInputRef.current?.focus();
      requestAnimationFrame(revealReplyTarget);
    },
    [post, resetCreateReply, revealReplyTarget, rows],
  );
  const closeReply = useCallback(() => {
    revealIdRef.current = null;
    setReplyTarget(null);
  }, []);
  const changeReply = useCallback(
    (text: string) => setDraft((current) => ({ ...current, text })),
    [],
  );

  const beginEdit = useCallback(() => {
    setEditContent(post?.content ?? '');
    setIsEditing(true);
    setPostErrorMessage(null);
  }, [post?.content]);
  const cancelEdit = useCallback(() => setIsEditing(false), []);
  const saveEdit = useCallback(async () => {
    if (editContent.trim().length === 0) {
      setPostErrorMessage(t('forum:contentRequired'));
      return;
    }
    setPostErrorMessage(null);
    try {
      await editPostAsync(editContent);
      setIsEditing(false);
    } catch {
      setPostErrorMessage(t('forum:publishFailed'));
    }
  }, [editContent, editPostAsync, t]);
  const confirmDelete = useCallback(() => setIsConfirmingDelete(true), []);
  const cancelDelete = useCallback(() => setIsConfirmingDelete(false), []);
  const performDelete = useCallback(async () => {
    setPostErrorMessage(null);
    try {
      await deletePostAsync();
      setIsConfirmingDelete(false);
    } catch {
      setPostErrorMessage(t('forum:deleteFailed'));
    }
  }, [deletePostAsync, t]);
  const submitReply = useCallback(async () => {
    if (replyTarget === null) return;
    if (draft.text.trim().length === 0) {
      setReplyErrorCode('VALIDATION-1');
      setReplyErrorMessage(t('forum:contentRequired'));
      return;
    }
    setReplyErrorCode(null);
    setReplyErrorMessage(null);
    let newReplyId: string;
    try {
      newReplyId = await createReplyAsync({
        content: draft.text,
        parentReplyId: replyTarget.parentReplyId,
      });
    } catch {
      setReplyErrorMessage(t('forum:replyFailed'));
      return;
    }
    revealIdRef.current = null;
    setReplyTarget(null);
    setDraft(EMPTY_DRAFT);
    // The answers are fresh once the send settles; the list then scrolls to hers.
    const refreshed = await refetchReplies();
    const index = threadRows(buildReplyThread(refreshed.data ?? EMPTY_REPLIES)).findIndex(
      (row) => row.reply.id === newReplyId,
    );
    if (index >= 0) {
      requestAnimationFrame(() =>
        listRef.current?.scrollToIndex({ index, viewPosition: REVEAL_IN_MIDDLE, animated: true }),
      );
    }
  }, [createReplyAsync, draft.text, refetchReplies, replyTarget, t]);

  const highlightedId = replyTarget?.messageId ?? null;
  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<ForumThreadRow>) => {
      const { reply } = item;
      const canReply = canReplyHere && reply.visibility === 'visible' && reply.content !== null;
      const postBy = t('forum:postBy', { name: reply.author_first_name });
      return (
        <PageWidth>
          <ForumThreadMessage
            id={reply.id}
            kind="reply"
            name={reply.author_first_name}
            avatarKey={personCards.get(reply.author_id)?.avatarKey ?? null}
            authorLabel={
              item.answersTo === null
                ? postBy
                : `${postBy}. ${t('forum:replyTo', { name: item.answersTo })}`
            }
            content={reply.content}
            tombstone={t('forum:deletedTombstone')}
            rails={item.rails}
            hasAnswersBelow={item.hasAnswersBelow}
            isHighlighted={reply.id === highlightedId}
            languageFontClass={languageFontClass}
            openLinkLabel={openLinkLabel}
            flagLabel={t('forum:flagShort')}
            flagAccessibilityLabel={t('forum:flagReply')}
            isFlagDisabled={!isOnline}
            onFlag={
              reply.author_id === user?.id || reply.visibility !== 'visible' ? null : flagReply
            }
            replyLabel={t('forum:reply')}
            isReplyDisabled={isReplyDisabled}
            onReply={canReply ? openReply : null}
          />
        </PageWidth>
      );
    },
    [
      canReplyHere,
      flagReply,
      highlightedId,
      isOnline,
      isReplyDisabled,
      languageFontClass,
      openLinkLabel,
      openReply,
      personCards,
      t,
      user?.id,
    ],
  );

  const confirmFlag = useCallback(() => {
    setFlagTarget(null);
    Alert.alert(t('forum:flagConfirmationTitle'), t('forum:flagConfirmation'));
    back();
  }, [back, t]);
  const closeFlagDialog = useCallback(() => setFlagTarget(null), []);

  if (postQuery.isPending && post === undefined) {
    return (
      <>
        <NativeScreenHeader title={t('forum:detailTitle')} />
        <AnnouncementFeedSkeleton accessibilityLabel={t('forum:loading')} />
      </>
    );
  }
  if (post === undefined) {
    return (
      <SafeAreaView edges={SAFE_AREA_BOTTOM_EDGES} style={styles.screen}>
        <NativeScreenHeader title={t('forum:detailTitle')} />
        <View className="flex-1 items-center justify-center gap-md px-lg">
          <Text
            selectable
            accessibilityRole="alert"
            className={`text-center text-neutral-700 ${languageFontClass}`}
          >
            {t('forum:loadFailed')}
          </Text>
          <AuthSubmitButton label={t('forum:retry')} onPress={retryPost} />
        </View>
      </SafeAreaView>
    );
  }

  const isComposerOpen = replyTarget !== null && canReplyHere;

  return (
    <ActionScreen
      className="bg-neutral-50"
      action={
        isComposerOpen ? (
          <View className="gap-sm">
            <View className="flex-row items-center gap-sm">
              <Icon
                name="reply"
                weight="boldDuotone"
                size={tokens.fontSize.xl}
                color={tokens.colors.primary.DEFAULT}
              />
              <Text
                className={`flex-1 text-start text-md font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('forum:replyingTo', { name: replyTarget.name })}
              </Text>
              <View>
                <RaisedActionButton
                  testID="forum-reply-close"
                  size="compact"
                  icon="close"
                  label={t('common:close')}
                  onPress={closeReply}
                />
              </View>
            </View>
            <AuthTextField
              ref={replyInputRef}
              testID="forum-reply-content"
              label={t('forum:replyingTo', { name: replyTarget.name })}
              isLabelVisible={false}
              placeholder={t('forum:replyPlaceholder')}
              value={draft.text}
              onChangeText={changeReply}
              maxLength={FORUM_REPLY_MAX_LENGTH}
              multiline
              autoFocus
              textAlignVertical="top"
              style={styles.replyInput}
            />
            <Text className={`text-end text-sm tabular-nums text-neutral-600 ${languageFontClass}`}>
              {t('forum:charactersRemaining', {
                count: FORUM_REPLY_MAX_LENGTH - draft.text.length,
              })}
            </Text>
            <ShakeOnError errorCode={replyErrorCode ?? replyMutationCode}>
              {replyErrorMessage === null && replyMutationCode === null ? null : (
                <Text
                  selectable
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  className={`text-start text-sm text-error ${languageFontClass}`}
                >
                  {replyErrorMessage ?? t('forum:replyFailed')}
                </Text>
              )}
            </ShakeOnError>
            <AuthSubmitButton
              testID="forum-submit-reply"
              label={createReply.isPending ? t('forum:replying') : t('forum:reply')}
              onPress={submitReply}
              isLoading={createReply.isPending}
              disabled={!isOnline || postingDisabled || postingStatus.isPending}
            />
          </View>
        ) : null
      }
    >
      <NativeScreenHeader title={t('forum:detailTitle')} />
      <FlashList
        ref={listRef}
        testID="forum-detail-screen"
        data={rows}
        renderItem={renderRow}
        keyExtractor={threadRowKeyExtractor}
        getItemType={threadRowType}
        extraData={highlightedId}
        style={styles.screen}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onLayout={measureList}
        refreshing={(postQuery.isRefetching || repliesQuery.isRefetching) && isOnline}
        onRefresh={refresh}
        ListHeaderComponent={
          <View onLayout={measureHeader}>
            <PageWidth>
              {isOnline && !postingDisabled ? null : (
                <View className="gap-sm px-lg pb-md">
                  {isOnline ? null : (
                    <Text
                      selectable
                      accessibilityRole="alert"
                      className={`text-start text-sm text-error ${languageFontClass}`}
                    >
                      {t('forum:offlineWrite')}
                    </Text>
                  )}
                  {postingDisabled ? (
                    <Text
                      selectable
                      accessibilityRole="alert"
                      className={`text-start text-sm text-neutral-700 ${languageFontClass}`}
                    >
                      {t('forum:postingDisabled')}
                    </Text>
                  ) : null}
                </View>
              )}
              <ForumThreadMessage
                id={post.id}
                kind="post"
                testID="forum-thread-post"
                name={post.author_first_name}
                avatarKey={personCards.get(post.author_id)?.avatarKey ?? null}
                authorLabel={t('forum:postBy', { name: post.author_first_name })}
                content={post.content}
                tombstone={t('forum:deletedTombstone')}
                rails={NO_RAILS}
                hasAnswersBelow={rows.length > 0}
                isHighlighted={post.id === highlightedId}
                languageFontClass={languageFontClass}
                openLinkLabel={openLinkLabel}
                flagLabel={t('forum:flagShort')}
                flagAccessibilityLabel={t('forum:flagPost')}
                isFlagDisabled={!isOnline}
                onFlag={isOwnPost || post.visibility !== 'visible' ? null : flagPost}
                replyLabel={t('forum:reply')}
                isReplyDisabled={isReplyDisabled}
                onReply={
                  canReplyHere && post.visibility === 'visible' && post.content !== null
                    ? openReply
                    : null
                }
                footer={
                  <>
                    {isOwnPost && !isEditing && !isConfirmingDelete ? (
                      <View className="flex-row gap-sm">
                        <View className="flex-1">
                          <RaisedActionButton
                            testID="forum-edit"
                            label={t('forum:edit')}
                            onPress={beginEdit}
                            isDisabled={!isOnline}
                          />
                        </View>
                        <View className="flex-1">
                          <RaisedActionButton
                            testID="forum-delete"
                            tone="danger"
                            label={t('forum:delete')}
                            onPress={confirmDelete}
                            isDisabled={!isOnline || deletePost.isPending}
                          />
                        </View>
                      </View>
                    ) : null}
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
                        <Text
                          className={`text-start text-md text-neutral-700 ${languageFontClass}`}
                        >
                          {t('forum:deleteConfirmBody')}
                        </Text>
                        <View className="flex-row gap-sm">
                          <View className="flex-1">
                            <RaisedActionButton label={t('forum:cancel')} onPress={cancelDelete} />
                          </View>
                          <View className="flex-1">
                            <RaisedActionButton
                              testID="forum-confirm-delete"
                              tone="danger"
                              label={t('forum:deleteConfirm')}
                              onPress={performDelete}
                              isDisabled={deletePost.isPending}
                            />
                          </View>
                        </View>
                      </View>
                    )}
                    {postErrorMessage === null ? null : (
                      <Text
                        selectable
                        accessibilityRole="alert"
                        accessibilityLiveRegion="polite"
                        className={`text-start text-sm text-error ${languageFontClass}`}
                      >
                        {postErrorMessage}
                      </Text>
                    )}
                  </>
                }
              >
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
                      style={styles.mixedDirectionInput}
                    />
                    <View className="flex-row gap-sm">
                      <View className="flex-1">
                        <RaisedActionButton label={t('forum:cancel')} onPress={cancelEdit} />
                      </View>
                      <View className="flex-1">
                        <AuthSubmitButton
                          testID="forum-save-edit"
                          label={editPost.isPending ? t('forum:saving') : t('forum:save')}
                          onPress={saveEdit}
                          isLoading={editPost.isPending}
                          disabled={!isOnline}
                        />
                      </View>
                    </View>
                  </View>
                ) : (
                  <ForumPlainText
                    content={post.content}
                    languageFontClass={languageFontClass}
                    openLinkLabel={openLinkLabel}
                  />
                )}
              </ForumThreadMessage>
            </PageWidth>
          </View>
        }
        ListEmptyComponent={
          repliesQuery.isPending && repliesQuery.data === undefined ? (
            <AnnouncementFeedSkeleton accessibilityLabel={t('forum:loading')} />
          ) : repliesQuery.isError && repliesQuery.data === undefined ? (
            <PageWidth className="items-center gap-md px-lg pb-lg">
              <Text
                selectable
                accessibilityRole="alert"
                className={`text-center text-neutral-700 ${languageFontClass}`}
              >
                {t('forum:loadFailed')}
              </Text>
              <AuthSubmitButton label={t('forum:retry')} onPress={retryReplies} />
            </PageWidth>
          ) : null
        }
      />
      <ForumFlagDialog
        target={flagTarget}
        postId={post.id}
        onClose={closeFlagDialog}
        onConfirmed={confirmFlag}
      />
    </ActionScreen>
  );
}

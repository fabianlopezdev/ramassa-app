import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ForumFlagDialog } from '@/components/forum/forum-flag-dialog';
import { ForumOwnPostActions, ForumOwnPostIcons } from '@/components/forum/forum-own-post-actions';
import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { ForumReplyComposer } from '@/components/forum/forum-reply-composer';
import { ForumThreadMessage } from '@/components/forum/forum-thread-message';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ActionScreen } from '@/components/layout/screen-action';
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
import { useForumPostWash } from '@/lib/use-forum-post-wash';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMarkForumPostSeen } from '@/lib/use-tab-news';
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
import { FORUM_POST_MAX_LENGTH } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const FORUM_DETAIL_IMAGE_HEIGHT = tokens.spacing['3xl'] * 4;
const SAFE_AREA_BOTTOM_EDGES = ['bottom'] as const;
const EMPTY_REPLIES: readonly ForumReplyRow[] = [];
const NO_RAILS = [] as const;
// A new answer lands in the middle of the list, with its context above it.
const REVEAL_IN_MIDDLE = 0.5;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  image: { width: '100%', height: FORUM_DETAIL_IMAGE_HEIGHT },
  mixedDirectionInput: { writingDirection: 'auto' },
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
  const listHeightRef = useRef(0);
  // The message kept in view above the reply field while it is open.
  const revealIdRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const post = postQuery.data;
  // The post opens onto the wash of its category's colour (RAPP-893).
  const { wash, screenStyle } = useForumPostWash(post?.category_id, styles.screen);
  useMarkForumPostSeen(post?.id);
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

  // Scrolls the message she answers into view right above the reply field: its
  // end at the bottom of what shows, or its start at the top when it is taller
  // than that, so her name and first line stay in view. The offset is worked
  // out from the list height measured here, which is fresh while the keyboard
  // opens, where the list's own window size can still be the height from before.
  const revealReplyTarget = useCallback(() => {
    const messageId = revealIdRef.current;
    const list = listRef.current;
    if (messageId === null || list === null) return;
    const firstItemOffset = list.getFirstItemOffset();
    let messageStart = 0;
    let messageEnd = firstItemOffset;
    if (messageId !== post?.id) {
      const layout = list.getLayout(rows.findIndex((row) => row.reply.id === messageId));
      if (layout === undefined) return;
      messageStart = firstItemOffset + layout.y;
      messageEnd = messageStart + layout.height;
    }
    const offset = Math.max(0, Math.min(messageStart, messageEnd - listHeightRef.current));
    list.scrollToOffset({ offset, animated: true });
  }, [post?.id, rows]);
  // Once the keyboard has finished opening, a last time, because a scroll
  // asked for while it still moves can be cut short.
  const revealAfterKeyboard = useCallback(
    () => requestAnimationFrame(revealReplyTarget),
    [revealReplyTarget],
  );
  const measureList = useCallback(
    (event: LayoutChangeEvent) => {
      listHeightRef.current = event.nativeEvent.layout.height;
      requestAnimationFrame(revealReplyTarget);
    },
    [revealReplyTarget],
  );

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
            authorAccessibilityLabel={
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
      backgroundColor={wash}
      action={
        isComposerOpen ? (
          <ForumReplyComposer
            name={replyTarget.name}
            text={draft.text}
            inputRef={replyInputRef}
            onChangeText={changeReply}
            onClose={closeReply}
            onSubmit={submitReply}
            isSubmitting={createReply.isPending}
            isSubmitDisabled={!isOnline || postingDisabled || postingStatus.isPending}
            errorMessage={
              replyErrorMessage ?? (replyMutationCode === null ? null : t('forum:replyFailed'))
            }
            errorCode={replyErrorCode ?? replyMutationCode}
            languageFontClass={languageFontClass}
            onKeyboardShown={revealAfterKeyboard}
          />
        ) : null
      }
    >
      <NativeScreenHeader title={t('forum:detailTitle')} backgroundColor={wash} />
      <FlashList
        ref={listRef}
        testID="forum-detail-screen"
        data={rows}
        renderItem={renderRow}
        keyExtractor={threadRowKeyExtractor}
        getItemType={threadRowType}
        extraData={highlightedId}
        style={screenStyle}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onLayout={measureList}
        refreshing={(postQuery.isRefetching || repliesQuery.isRefetching) && isOnline}
        onRefresh={refresh}
        ListHeaderComponent={
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
              authorAccessibilityLabel={t('forum:postBy', { name: post.author_first_name })}
              content={post.content}
              tombstone={t('forum:deletedTombstone')}
              rails={NO_RAILS}
              hasAnswersBelow={rows.length > 0}
              isHighlighted={post.id === highlightedId}
              languageFontClass={languageFontClass}
              openLinkLabel={openLinkLabel}
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
              startActions={
                isOwnPost && !isEditing && !isConfirmingDelete ? (
                  <ForumOwnPostIcons
                    isOnline={isOnline}
                    isDeleting={deletePost.isPending}
                    onEdit={beginEdit}
                    onAskDelete={confirmDelete}
                  />
                ) : undefined
              }
              footer={
                <ForumOwnPostActions
                  isConfirmingDelete={isConfirmingDelete}
                  isDeleting={deletePost.isPending}
                  onCancelDelete={cancelDelete}
                  onConfirmDelete={performDelete}
                  errorMessage={postErrorMessage}
                  languageFontClass={languageFontClass}
                />
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

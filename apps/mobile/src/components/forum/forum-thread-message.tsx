/**
 * One message of a forum thread (RAPP-884): the post, an answer to it, or an
 * answer to an answer. The post screen draws all three with this component, so
 * they read as one thread.
 *
 * The author's avatar sits in a rail at the start. While the message has
 * answers below it, a line runs down from under the avatar, and the answers sit
 * indented under it by one rail. At each answer the line turns with a rounded
 * corner into that answer's avatar: a branch while more answers follow, its
 * end at the last one. Each row draws the pieces of the lines of the messages
 * above it (`rails`, decided by `threadRows`), and nothing pads the rows apart
 * from outside, so the pieces join into one continuous line from row to row.
 *
 * Report sits at the end of the author row and reply at the end under the
 * text, as raised buttons that show only their icon (the owner's choice for
 * this screen), each a full tap target with its long label for the screen reader.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { RAISED_ICON_FACE_SIZE } from '@/components/layout/raised-surface';
import { PERSON_AVATAR_SIZE, PersonAvatar } from '@/components/people/person-avatar';
import type { ForumThreadRail } from '@/lib/forum-reply-thread';
import { memo, useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// The author row is as tall as the report button beside the name, and the
// avatar sits centred in a box of the same height, so avatar and name line up.
const AUTHOR_ROW_HEIGHT = RAISED_ICON_FACE_SIZE + tokens.languageChoice.shadowBlockOffset;
const AVATAR_SIZE = PERSON_AVATAR_SIZE.small;
const LINE_WIDTH = tokens.forum.threadLineWidth;
const LINE_COLOR = tokens.colors.neutral[300];
// The line runs down the middle of the rail, under the middle of the avatar.
const LINE_START = (AVATAR_SIZE - LINE_WIDTH) / 2;
const AVATAR_MIDDLE = AUTHOR_ROW_HEIGHT / 2;
// The rail and the avatar of the answer are this far apart (`gap-sm`).
const RAIL_GAP = tokens.spacing.sm;
const styles = StyleSheet.create({
  rail: { width: AVATAR_SIZE },
  avatarBox: { height: AUTHOR_ROW_HEIGHT, justifyContent: 'center' },
  authorRow: { minHeight: AUTHOR_ROW_HEIGHT },
  // Straight down the whole row.
  straight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: LINE_START,
    width: LINE_WIDTH,
    backgroundColor: LINE_COLOR,
  },
  // From under its own avatar to the bottom of the row, towards its answers.
  ownLine: {
    position: 'absolute',
    top: AVATAR_MIDDLE + AVATAR_SIZE / 2,
    bottom: 0,
    start: LINE_START,
    width: LINE_WIDTH,
    backgroundColor: LINE_COLOR,
  },
  // Down from the top of the row and round into the edge of the answer's
  // avatar, whose middle the bottom border meets.
  corner: {
    position: 'absolute',
    top: 0,
    start: LINE_START,
    width: AVATAR_SIZE - LINE_START + RAIL_GAP,
    height: AVATAR_MIDDLE + LINE_WIDTH / 2,
    borderStartWidth: LINE_WIDTH,
    borderBottomWidth: LINE_WIDTH,
    borderBottomStartRadius: tokens.radius.md,
    borderColor: LINE_COLOR,
  },
});

/** The piece of a line from a message above that passes beside this row. */
function ThreadRail({ rail }: { readonly rail: ForumThreadRail }) {
  return (
    <View style={styles.rail} accessible={false} importantForAccessibility="no-hide-descendants">
      {rail === 'through' || rail === 'branch' ? <View style={styles.straight} /> : null}
      {rail === 'branch' || rail === 'corner' ? <View style={styles.corner} /> : null}
    </View>
  );
}

const renderRail = (rail: ForumThreadRail, index: number) => <ThreadRail key={index} rail={rail} />;

export const ForumThreadMessage = memo(function ForumThreadMessage({
  id,
  kind,
  testID,
  name,
  avatarKey,
  authorLabel,
  content,
  tombstone,
  rails,
  hasAnswersBelow,
  isHighlighted,
  languageFontClass,
  openLinkLabel,
  flagAccessibilityLabel,
  isFlagDisabled,
  onFlag,
  replyLabel,
  isReplyDisabled,
  onReply,
  children,
  footer,
}: {
  readonly id: string;
  /** The post itself, or an answer at either level. */
  readonly kind: 'post' | 'reply';
  readonly testID?: string;
  readonly name: string;
  /** A team member's photo (RAPP-639); players show their initial. */
  readonly avatarKey: string | null;
  /** What the screen reader says for the author, such as "Publicat per Amina". */
  readonly authorLabel: string;
  /** The text; null once the author deleted it, which shows the tombstone. */
  readonly content: string | null;
  readonly tombstone: string;
  readonly rails: readonly ForumThreadRail[];
  readonly hasAnswersBelow: boolean;
  /** The message she is answering right now. */
  readonly isHighlighted: boolean;
  readonly languageFontClass: string;
  readonly openLinkLabel: (url: string) => string;
  readonly flagAccessibilityLabel: string;
  readonly isFlagDisabled: boolean;
  /** Null hides the report button: her own message, or one that is not visible. */
  readonly onFlag: ((id: string) => void) | null;
  readonly replyLabel: string;
  readonly isReplyDisabled: boolean;
  /** Null hides "Respon". */
  readonly onReply: ((id: string) => void) | null;
  /** In place of the text, such as the post's photo and text or its edit field. */
  readonly children?: ReactNode;
  /** Under "Respon", such as the post's own Edit and Delete. */
  readonly footer?: ReactNode;
}) {
  const flag = useCallback(() => onFlag?.(id), [onFlag, id]);
  const reply = useCallback(() => onReply?.(id), [onReply, id]);
  return (
    <View
      testID={testID}
      className={`flex-row gap-sm px-lg ${isHighlighted ? 'bg-primary/10' : ''}`}
    >
      {rails.map(renderRail)}
      <View style={styles.rail}>
        {hasAnswersBelow ? <View style={styles.ownLine} /> : null}
        <View style={styles.avatarBox}>
          <PersonAvatar name={name} avatarKey={avatarKey} size="small" />
        </View>
      </View>
      <View className="flex-1 gap-sm pb-md">
        <View className="flex-row items-center gap-sm" style={styles.authorRow}>
          <Text
            accessibilityLabel={authorLabel}
            className={`flex-1 text-start text-md font-bold text-primary-dark ${languageFontClass}`}
          >
            {name}
          </Text>
          {onFlag === null ? null : (
            <View>
              <RaisedActionButton
                testID={kind === 'post' ? 'forum-flag-post' : `forum-flag-reply-${id}`}
                size="compact"
                icon="flag"
                isLabelHidden
                label={flagAccessibilityLabel}
                onPress={flag}
                isDisabled={isFlagDisabled}
              />
            </View>
          )}
        </View>
        {children ??
          (content === null ? (
            <Text className={`text-start text-md italic text-neutral-600 ${languageFontClass}`}>
              {tombstone}
            </Text>
          ) : (
            <ForumPlainText
              content={content}
              languageFontClass={languageFontClass}
              openLinkLabel={openLinkLabel}
            />
          ))}
        {onReply === null ? null : (
          <RaisedActionButton
            testID={kind === 'post' ? 'forum-reply-post' : `forum-reply-to-${id}`}
            size="compact"
            icon="reply"
            isLabelHidden
            label={replyLabel}
            onPress={reply}
            isDisabled={isReplyDisabled}
          />
        )}
        {footer}
      </View>
    </View>
  );
});

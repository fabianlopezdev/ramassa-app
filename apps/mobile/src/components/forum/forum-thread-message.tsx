/**
 * One message of a forum thread (RAPP-884): the post, an answer to it, or an
 * answer to an answer. The post screen draws all three with this component, so
 * they read as one thread.
 *
 * The author's avatar sits in a rail at the start. While the message has
 * answers below it, a line runs down from under the avatar, and the answers sit
 * indented under it by one rail. At each answer the line sweeps round in one
 * quarter circle into the middle of that answer's avatar: a branch while more
 * answers follow, its end at the last one. Each row draws the pieces of the lines of the messages
 * above it (`rails`, decided by `threadRows`), and nothing pads the rows apart
 * from outside, so the pieces join into one continuous line from row to row.
 *
 * Under the text, at the end, the red report button (the shared flag every
 * report control uses, RAPP-892) and then reply: small raised buttons that
 * show only their icon (the owner's choice for this screen), each a full tap
 * target with its long label for the screen reader.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ForumFlagButton } from '@/components/forum/forum-flag-button';
import { ForumPlainText } from '@/components/forum/forum-plain-text';
import {
  raisedIconHitSlop,
  raisedIconStartReachBeforeNeighbour,
} from '@/components/layout/raised-surface';
import { PERSON_AVATAR_SIZE, PersonAvatar } from '@/components/people/person-avatar';
import type { ForumThreadRail } from '@/lib/forum-reply-thread';
import { memo, useCallback, type ReactNode } from 'react';
import { I18nManager, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// The author row holds only the avatar and the name, so it is as tall as the
// avatar, and the name sits level with the avatar's middle.
const AVATAR_SIZE = PERSON_AVATAR_SIZE.small;
const AUTHOR_ROW_HEIGHT = AVATAR_SIZE;
// The same room above a message's content as below it, inside the row, so a
// highlighted row sits evenly in its band. The lines run through this room.
const ROW_PADDING = tokens.spacing.xs;
const LINE_WIDTH = tokens.forum.threadLineWidth;
const LINE_COLOR = tokens.colors.neutral[300];
// The line runs down the middle of the rail, under the middle of the avatar.
const LINE_START = (AVATAR_SIZE - LINE_WIDTH) / 2;
const AVATAR_MIDDLE = ROW_PADDING + AUTHOR_ROW_HEIGHT / 2;
// The rail and the avatar of the answer are this far apart (`gap-sm`).
const RAIL_GAP = tokens.spacing.sm;
// The turn into an answer's avatar runs from the line to the avatar's edge and
// from the top of the row down to the avatar's middle; the curve takes the
// largest quarter circle that fits both, so it sweeps round with no straight stub.
const CORNER_WIDTH = AVATAR_SIZE - LINE_START + RAIL_GAP;
const CORNER_HEIGHT = AVATAR_MIDDLE + LINE_WIDTH / 2;
const CORNER_RADIUS = Math.min(CORNER_WIDTH, CORNER_HEIGHT);
// Flag and reply sit as a pair, `gap-sm` apart. Each touch reaches half the gap
// towards the other, so the two tap areas meet in its middle without
// overlapping, and the rest of each full tap target reaches away from the pair.
const PAIR_HALF_GAP = tokens.spacing.sm / 2;
// Her own post has three: delete, edit and reply, `gap-md` apart, so the
// middle one's tap area (its face plus a half gap each side) still reaches a
// full tap target across.
const TRIO_HALF_GAP = tokens.spacing.md / 2;

const REPLY_HIT_SLOP = raisedIconHitSlop('regular', PAIR_HALF_GAP, I18nManager.isRTL);
const TRIO_REPLY_HIT_SLOP = raisedIconHitSlop('regular', TRIO_HALF_GAP, I18nManager.isRTL);
/** Where the touch of her own post's delete and edit buttons reaches (RAPP-884). */
export const OWN_POST_HIT_SLOPS = {
  delete: raisedIconHitSlop(
    'small',
    raisedIconStartReachBeforeNeighbour('small', TRIO_HALF_GAP),
    I18nManager.isRTL,
  ),
  edit: raisedIconHitSlop('regular', TRIO_HALF_GAP, I18nManager.isRTL),
} as const;
const styles = StyleSheet.create({
  rail: { width: AVATAR_SIZE },
  avatarBox: { marginTop: ROW_PADDING, height: AUTHOR_ROW_HEIGHT, justifyContent: 'center' },
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
    top: ROW_PADDING + AVATAR_SIZE,
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
    width: CORNER_WIDTH,
    height: CORNER_HEIGHT,
    borderStartWidth: LINE_WIDTH,
    borderBottomWidth: LINE_WIDTH,
    borderBottomStartRadius: CORNER_RADIUS,
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
  startActions,
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
  /**
   * At the start of the action row in place of the flag, such as delete and
   * edit on her own post; reply stays at the end.
   */
  readonly startActions?: ReactNode;
  /** In place of the text, such as the post's photo and text or its edit field. */
  readonly children?: ReactNode;
  /** Under the action row, such as the delete confirmation on her own post. */
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
      <View className="flex-1 gap-sm py-xs">
        <View className="justify-center" style={styles.authorRow}>
          <Text
            accessibilityLabel={authorLabel}
            className={`text-start text-md font-bold text-primary-dark ${languageFontClass}`}
          >
            {name}
          </Text>
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
        {onFlag === null && onReply === null && startActions === undefined ? null : (
          <View
            className={`flex-row items-center justify-end ${startActions === undefined ? 'gap-sm' : 'gap-md'}`}
          >
            {startActions}
            {onFlag === null || startActions !== undefined ? null : (
              <ForumFlagButton
                testID={kind === 'post' ? 'forum-flag-post' : `forum-flag-reply-${id}`}
                endNeighbourHalfGap={onReply === null ? undefined : PAIR_HALF_GAP}
                accessibilityLabel={flagAccessibilityLabel}
                onPress={flag}
                isDisabled={isFlagDisabled}
              />
            )}
            {onReply === null ? null : (
              <RaisedActionButton
                testID={kind === 'post' ? 'forum-reply-post' : `forum-reply-to-${id}`}
                size="compact"
                icon="reply"
                isLabelHidden
                hitSlop={
                  startActions !== undefined
                    ? TRIO_REPLY_HIT_SLOP
                    : onFlag === null
                      ? undefined
                      : REPLY_HIT_SLOP
                }
                label={replyLabel}
                onPress={reply}
                isDisabled={isReplyDisabled}
              />
            )}
          </View>
        )}
        {footer}
      </View>
    </View>
  );
});

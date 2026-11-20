/**
 * One message of a forum thread (RAPP-884): the post, an answer to it, or an
 * answer to an answer. The post screen draws all three with this component, so
 * they read as one thread.
 *
 * The author's avatar sits in a rail at the start. While the message has
 * answers below it, a line runs down from under the avatar, and the answers sit
 * indented under it by one rail. Each row also draws the pieces of the lines of
 * the messages above it (`rails`), and nothing pads the rows apart from outside,
 * so the pieces join into one continuous line from row to row.
 *
 * "Avisa" sits at the end of the author row and "Respon" at the end under the
 * text. Both are compact raised buttons, whose tap area reaches 48 points.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { PERSON_AVATAR_SIZE, PersonAvatar } from '@/components/people/person-avatar';
import type { ForumThreadRail } from '@/lib/forum-reply-thread';
import { memo, useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// The avatar sits centred in a box as tall as the author row, whose report
// button is a full tap target, so the avatar and the name line up.
const AUTHOR_ROW_HEIGHT = tokens.tapTarget.min;
const styles = StyleSheet.create({
  rail: { width: PERSON_AVATAR_SIZE.small, alignItems: 'center' },
  avatarBox: { height: AUTHOR_ROW_HEIGHT, justifyContent: 'center' },
  // The last answer's line stops level with the middle of its avatar.
  railEnd: { height: AUTHOR_ROW_HEIGHT / 2 },
});
const LINE_CLASS_NAME = 'border-s-2 border-neutral-300';

/** The piece of a line from a message above that passes beside this row. */
function ThreadRail({ rail }: { readonly rail: ForumThreadRail }) {
  return (
    <View style={styles.rail} accessible={false} importantForAccessibility="no-hide-descendants">
      {rail === 'through' ? <View className={`flex-1 ${LINE_CLASS_NAME}`} /> : null}
      {rail === 'end' ? <View className={LINE_CLASS_NAME} style={styles.railEnd} /> : null}
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
  flagLabel,
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
  readonly flagLabel: string;
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
        <View style={styles.avatarBox}>
          <PersonAvatar name={name} avatarKey={avatarKey} size="small" />
        </View>
        {hasAnswersBelow ? <View className={`flex-1 ${LINE_CLASS_NAME}`} /> : null}
      </View>
      <View className="flex-1 gap-sm pb-md">
        <View className="min-h-min flex-row items-center gap-sm">
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
                label={flagLabel}
                accessibilityLabel={flagAccessibilityLabel}
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

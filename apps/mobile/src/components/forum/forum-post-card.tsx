import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { RaisedCard, type RaisedCardBadge } from '@/components/layout/raised-card';
import type { RaisedTone } from '@/components/layout/raised-surface';
import { PersonAvatar } from '@/components/people/person-avatar';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { ForumPostRow } from '@ramassa/shared/forum';
import { tokens } from '@ramassa/shared/tokens';

const FORUM_POST_IMAGE_HEIGHT = tokens.spacing['3xl'] * 3;
const FORUM_POST_PREVIEW_LINES = 5;
const styles = StyleSheet.create({
  image: { width: '100%', height: FORUM_POST_IMAGE_HEIGHT },
});

/**
 * A forum post on Comunitat as the shared raised card (RAPP-852): its photo
 * across the top, the author's avatar in the block before the divider
 * (RAPP-859), the author's first name alone (RAPP-912), a preview of the text and the number of
 * replies, in the colour of its category. A pinned post carries the word on
 * the card's top edge, like "Nou" on an avis.
 *
 * A post new to her carries her word for new on that edge in its place
 * (RAPP-873), and the count of replies she has not read sits on the same edge
 * near the end, in the circle. The caller says both in the card's label.
 *
 * Without a photo the avatar shows the person icon in place of the initial,
 * so a photo is what makes her card hers.
 */
export const ForumPostCard = memo(function ForumPostCard({
  post,
  tone,
  authorAvatarKey,
  repliesLabel,
  pinnedLabel,
  imageAlt,
  accessibilityLabel,
  languageFontClass,
  accessToken,
  openLinkLabel,
  onOpen,
  unseenLabel = null,
  newRepliesCount = null,
}: {
  readonly post: ForumPostRow;
  /** The colour of the post's category, as a wash on the card. */
  readonly tone?: RaisedTone;
  /** The author's photo (RAPP-639); without one, the person icon. */
  readonly authorAvatarKey: string | null;
  readonly repliesLabel: string;
  readonly pinnedLabel: string;
  readonly imageAlt: string;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly accessToken: string | undefined;
  readonly openLinkLabel: (url: string) => string;
  readonly onOpen: (id: string) => void;
  /** Set while the post is new to her: the word on the card's edge, ahead of pinned. */
  readonly unseenLabel?: string | null;
  /** The replies she has not read, already formatted, in the circle on the edge. */
  readonly newRepliesCount?: string | null;
}) {
  const imageSource = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: post.image_url,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, post.image_url],
  );
  const open = useCallback(() => onOpen(post.id), [onOpen, post.id]);
  const badge = useMemo<RaisedCardBadge | null>(() => {
    if (unseenLabel !== null) return { label: unseenLabel, tone: 'brand' };
    return post.is_pinned ? { label: pinnedLabel, tone: 'accent' } : null;
  }, [pinnedLabel, post.is_pinned, unseenLabel]);
  const cardAccessibilityLabel = [
    accessibilityLabel,
    post.is_pinned ? pinnedLabel : null,
    repliesLabel,
  ]
    .filter((part): part is string => part !== null)
    .join('. ');
  return (
    <RaisedCard
      testID={`forum-post-${post.id}`}
      accessibilityLabel={cardAccessibilityLabel}
      onOpen={open}
      badge={badge}
      count={newRepliesCount}
      tone={tone}
      leading={
        <PersonAvatar
          name={post.author_first_name}
          avatarKey={authorAvatarKey}
          size="card"
          fallback="person"
        />
      }
      media={
        imageSource === null ? null : (
          <Image
            source={imageSource}
            accessibilityLabel={imageAlt}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={post.image_url ?? post.id}
            style={styles.image}
          />
        )
      }
    >
      <Text className={`text-start text-md font-bold text-primary-dark ${languageFontClass}`}>
        {post.author_first_name}
      </Text>
      {post.content === null ? null : (
        <ForumPlainText
          content={post.content}
          languageFontClass={languageFontClass}
          openLinkLabel={openLinkLabel}
          numberOfLines={FORUM_POST_PREVIEW_LINES}
        />
      )}
      <Text className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}>
        {repliesLabel}
      </Text>
    </RaisedCard>
  );
});

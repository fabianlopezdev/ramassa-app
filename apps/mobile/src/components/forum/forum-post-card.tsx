import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { RaisedCard, type RaisedCardBadge } from '@/components/layout/raised-card';
import {
  RaisedCardFooterAuthor,
  RaisedCardFooterReplies,
  raisedCardPanelInk,
} from '@/components/layout/raised-card-footer';
import { RaisedCardPhoto, useRaisedCardPhotoSource } from '@/components/layout/raised-card-photo';
import type { RaisedTone } from '@/components/layout/raised-surface';
import { PersonAvatar } from '@/components/people/person-avatar';
import { splitForumPostTitle } from '@/lib/forum-post-title';
import type { Href } from 'expo-router';
import { memo, useMemo } from 'react';
import { Text } from 'react-native';
import type { ForumPostRow } from '@ramassa/shared/forum';

const FORUM_POST_PREVIEW_LINES = 5;

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
 *
 * A post with a photo takes the photo layout of the shared card (RAPP-921):
 * its first sentence is the title on the photo, the rest is the preview on the
 * panel, and the author and the replies share the row at its foot. The replies
 * show only when there is at least one (RAPP-922). A post in a coloured
 * category sits on the wash of that colour, so its preview takes the dark ink
 * of the plain cards (RAPP-930).
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
  href,
  unseenLabel = null,
  newRepliesCount = null,
}: {
  readonly post: ForumPostRow;
  /** The colour of the post's category, as a wash on the card. */
  readonly tone?: RaisedTone;
  /** The author's photo (RAPP-639); without one, the person icon. */
  readonly authorAvatarKey: string | null;
  /** Such as "2 respostes"; null when the post has no replies (RAPP-922). */
  readonly repliesLabel: string | null;
  readonly pinnedLabel: string;
  readonly imageAlt: string;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly accessToken: string | undefined;
  readonly openLinkLabel: (url: string) => string;
  /** The post's own screen; its photo grows into that screen's photo (RAPP-916). */
  readonly href: Href;
  /** Set while the post is new to her: the word on the card's edge, ahead of pinned. */
  readonly unseenLabel?: string | null;
  /** The replies she has not read, already formatted, in the circle on the edge. */
  readonly newRepliesCount?: string | null;
}) {
  const imageSource = useRaisedCardPhotoSource(post.image_url, accessToken);
  const hasPhoto = imageSource !== null;
  const { title, preview } = useMemo(() => splitForumPostTitle(post.content), [post.content]);
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
      href={href}
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
          <RaisedCardPhoto
            source={imageSource}
            accessibilityLabel={imageAlt}
            recyclingKey={post.image_url ?? post.id}
          />
        )
      }
      mediaTitle={title}
      footer={[
        <RaisedCardFooterAuthor
          key="author"
          name={post.author_first_name}
          avatarKey={authorAvatarKey}
        />,
        repliesLabel === null ? null : (
          <RaisedCardFooterReplies key="replies" label={repliesLabel} />
        ),
      ]}
    >
      {hasPhoto ? (
        preview === null ? null : (
          <ForumPlainText
            content={preview}
            languageFontClass={languageFontClass}
            openLinkLabel={openLinkLabel}
            numberOfLines={FORUM_POST_PREVIEW_LINES}
            ink={raisedCardPanelInk(tone) === 'onWash' ? 'default' : 'onBrand'}
          />
        )
      ) : (
        <>
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
          {repliesLabel === null ? null : (
            <Text
              className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}
            >
              {repliesLabel}
            </Text>
          )}
        </>
      )}
    </RaisedCard>
  );
});

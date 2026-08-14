import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { PressableScale } from '@/components/motion/pressable-scale';
import { composeContinuousViewStyle } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ForumPostRow } from '@ramassa/shared/forum';
import { tokens } from '@ramassa/shared/tokens';

const FORUM_POST_IMAGE_HEIGHT = tokens.spacing['3xl'] * 3;
const FORUM_POST_PREVIEW_LINES = 5;
const FORUM_POST_CARD_BORDER_WIDTH = 1;
const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: FORUM_POST_CARD_BORDER_WIDTH,
    borderColor: tokens.colors.neutral[200],
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.white,
  },
  image: { width: '100%', height: FORUM_POST_IMAGE_HEIGHT },
});
const cardStyle = composeContinuousViewStyle(styles.card);

export const ForumPostCard = memo(function ForumPostCard({
  post,
  authorLabel,
  repliesLabel,
  pinnedLabel,
  imageAlt,
  accessibilityLabel,
  languageFontClass,
  accessToken,
  openLinkLabel,
  onOpen,
}: {
  readonly post: ForumPostRow;
  readonly authorLabel: string;
  readonly repliesLabel: string;
  readonly pinnedLabel: string;
  readonly imageAlt: string;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly accessToken: string | undefined;
  readonly openLinkLabel: (url: string) => string;
  readonly onOpen: (id: string) => void;
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
  return (
    <PressableScale
      testID={`forum-post-${post.id}`}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={repliesLabel}
      onPress={open}
      haptic="tapLight"
      style={cardStyle}
      className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
    >
      {imageSource === null ? null : (
        <Image
          source={imageSource}
          accessibilityLabel={imageAlt}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={post.image_url ?? post.id}
          style={styles.image}
        />
      )}
      <View className="gap-sm p-md">
        <View className="flex-row flex-wrap items-center gap-sm">
          <Text className={`text-start text-sm font-bold text-primary-dark ${languageFontClass}`}>
            {authorLabel}
          </Text>
          {post.is_pinned ? (
            <Text
              className={`rounded-full bg-secondary-light px-sm py-xs text-xs font-semibold text-neutral-900 ${languageFontClass}`}
            >
              {pinnedLabel}
            </Text>
          ) : null}
        </View>
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
      </View>
    </PressableScale>
  );
});

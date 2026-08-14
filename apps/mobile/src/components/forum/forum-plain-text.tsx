import { playHaptic } from '@/lib/haptics/haptics';
import * as Linking from 'expo-linking';
import { memo, useCallback, useMemo } from 'react';
import { Text, type TextStyle } from 'react-native';
import { parseForumPlainText, type ForumTextSegment } from '@ramassa/shared/forum';

const mixedDirectionTextStyle: TextStyle = { writingDirection: 'auto' };

const ForumLink = memo(function ForumLink({
  url,
  accessibilityLabel,
}: {
  readonly url: string;
  readonly accessibilityLabel: string;
}) {
  const open = useCallback(() => {
    playHaptic('tapLight');
    void Linking.openURL(url);
  }, [url]);
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={open}
      className="text-primary underline"
    >
      {url}
    </Text>
  );
});

export const ForumPlainText = memo(function ForumPlainText({
  content,
  languageFontClass,
  openLinkLabel,
  className = '',
  numberOfLines,
}: {
  readonly content: string;
  readonly languageFontClass: string;
  readonly openLinkLabel: (url: string) => string;
  readonly className?: string;
  readonly numberOfLines?: number;
}) {
  const segments = useMemo(() => parseForumPlainText(content), [content]);
  const renderSegment = useCallback(
    (segment: ForumTextSegment, index: number) =>
      segment.kind === 'link' ? (
        <ForumLink
          key={`${segment.value}:${index}`}
          url={segment.value}
          accessibilityLabel={openLinkLabel(segment.value)}
        />
      ) : (
        segment.value
      ),
    [openLinkLabel],
  );
  return (
    <Text
      selectable
      style={mixedDirectionTextStyle}
      className={`text-start text-md text-neutral-900 ${languageFontClass} ${className}`}
      numberOfLines={numberOfLines}
    >
      {segments.map(renderSegment)}
    </Text>
  );
});

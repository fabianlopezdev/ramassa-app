import { playHaptic } from '@/lib/haptics/haptics';
import * as Linking from 'expo-linking';
import { memo, useCallback, useMemo } from 'react';
import { Text, type TextStyle } from 'react-native';
import { parseForumPlainText, type ForumTextSegment } from '@ramassa/shared/forum';

const mixedDirectionTextStyle: TextStyle = { writingDirection: 'auto' };

/** The colours of the text and its links: on a white face, or on the brand panel of a photo card (RAPP-921). */
const INK_CLASSES = {
  default: { text: 'text-neutral-900', link: 'text-primary-dark' },
  onBrand: { text: 'text-white', link: 'text-white' },
} as const;
type ForumTextInk = keyof typeof INK_CLASSES;

const ForumLink = memo(function ForumLink({
  url,
  accessibilityLabel,
  ink,
}: {
  readonly url: string;
  readonly accessibilityLabel: string;
  readonly ink: ForumTextInk;
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
      className={`${INK_CLASSES[ink].link} underline`}
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
  ink = 'default',
}: {
  readonly content: string;
  readonly languageFontClass: string;
  readonly openLinkLabel: (url: string) => string;
  readonly className?: string;
  readonly numberOfLines?: number;
  readonly ink?: ForumTextInk;
}) {
  const segments = useMemo(() => parseForumPlainText(content), [content]);
  const renderSegment = useCallback(
    (segment: ForumTextSegment, index: number) =>
      segment.kind === 'link' ? (
        <ForumLink
          key={`${segment.value}:${index}`}
          url={segment.value}
          accessibilityLabel={openLinkLabel(segment.value)}
          ink={ink}
        />
      ) : (
        segment.value
      ),
    [ink, openLinkLabel],
  );
  return (
    <Text
      selectable
      style={mixedDirectionTextStyle}
      className={`text-start text-md ${INK_CLASSES[ink].text} ${languageFontClass} ${className}`}
      numberOfLines={numberOfLines}
    >
      {segments.map(renderSegment)}
    </Text>
  );
});

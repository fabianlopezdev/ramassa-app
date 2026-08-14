import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import type { ForumReplyRow } from '@ramassa/shared/forum';

export const ForumReplyCard = memo(function ForumReplyCard({
  reply,
  authorLabel,
  tombstone,
  languageFontClass,
  openLinkLabel,
  flagLabel,
  flagAccessibilityLabel,
  isFlagDisabled,
  onFlag,
}: {
  readonly reply: ForumReplyRow;
  readonly authorLabel: string;
  readonly tombstone: string;
  readonly languageFontClass: string;
  readonly openLinkLabel: (url: string) => string;
  readonly flagLabel: string;
  readonly flagAccessibilityLabel: string;
  readonly isFlagDisabled: boolean;
  readonly onFlag: ((id: string) => void) | null;
}) {
  const flag = useCallback(() => onFlag?.(reply.id), [onFlag, reply.id]);
  return (
    <View className="gap-sm pb-md">
      <View
        accessibilityLabel={authorLabel}
        className="gap-sm rounded-lg border border-neutral-200 bg-neutral-50 p-md"
        style={continuousCorners}
      >
        <Text className={`text-start text-sm font-bold text-primary-dark ${languageFontClass}`}>
          {authorLabel}
        </Text>
        {reply.content === null ? (
          <Text className={`text-start text-md italic text-neutral-600 ${languageFontClass}`}>
            {tombstone}
          </Text>
        ) : (
          <ForumPlainText
            content={reply.content}
            languageFontClass={languageFontClass}
            openLinkLabel={openLinkLabel}
          />
        )}
      </View>
      {onFlag === null ? null : (
        <PressableScale
          testID={`forum-flag-reply-${reply.id}`}
          accessibilityLabel={flagAccessibilityLabel}
          onPress={flag}
          haptic="warning"
          isDisabled={isFlagDisabled}
          style={continuousCorners}
          className="min-h-recommended self-start justify-center rounded-md border border-neutral-300 px-lg"
        >
          <Text className={`font-semibold text-neutral-700 ${languageFontClass}`}>{flagLabel}</Text>
        </PressableScale>
      )}
    </View>
  );
});

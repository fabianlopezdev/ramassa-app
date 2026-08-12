import { ForumPlainText } from '@/components/forum/forum-plain-text';
import { continuousCorners } from '@/lib/continuous-corners';
import { memo } from 'react';
import { Text, View } from 'react-native';
import type { ForumReplyRow } from '@ramassa/shared/forum';

export const ForumReplyCard = memo(function ForumReplyCard({
  reply,
  authorLabel,
  tombstone,
  languageFontClass,
  openLinkLabel,
}: {
  readonly reply: ForumReplyRow;
  readonly authorLabel: string;
  readonly tombstone: string;
  readonly languageFontClass: string;
  readonly openLinkLabel: (url: string) => string;
}) {
  return (
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
  );
});

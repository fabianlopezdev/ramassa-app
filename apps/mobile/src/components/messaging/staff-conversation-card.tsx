import { RaisedCard } from '@/components/layout/raised-card';
import { memo, useCallback } from 'react';
import { Text } from 'react-native';

/** One conversation in the staff inbox: the raised card, with the unread count on its edge. */
export const StaffConversationCard = memo(function StaffConversationCard({
  conversationId,
  participantName,
  participantRole,
  messagePreview,
  unreadBadge,
  accessibilityLabel,
  accessibilityHint,
  languageClass,
  onOpen,
}: {
  readonly conversationId: string;
  readonly participantName: string;
  readonly participantRole: string;
  readonly messagePreview: string;
  readonly unreadBadge: string | null;
  readonly accessibilityLabel: string;
  readonly accessibilityHint: string | undefined;
  readonly languageClass: string;
  readonly onOpen: (conversationId: string) => void;
}) {
  const handleOpen = useCallback(() => onOpen(conversationId), [conversationId, onOpen]);

  return (
    <RaisedCard
      testID={`staff-conversation-${conversationId}`}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      count={unreadBadge}
      onOpen={handleOpen}
    >
      <Text className={`text-start text-lg font-semibold text-neutral-900 ${languageClass}`}>
        {participantName}
      </Text>
      <Text className={`text-start text-sm text-neutral-600 ${languageClass}`}>
        {participantRole}
      </Text>
      <Text className={`text-start text-sm text-neutral-600 ${languageClass}`} numberOfLines={1}>
        {messagePreview}
      </Text>
    </RaisedCard>
  );
});

import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { memo, useCallback } from 'react';
import { Text, View, type TextStyle } from 'react-native';

const tabularNumerals: TextStyle = { fontVariant: ['tabular-nums'] };

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
    <PressableScale
      testID={`staff-conversation-${conversationId}`}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={handleOpen}
      haptic="selection"
      style={continuousCorners}
      className="rounded-2xl border border-neutral-200 bg-white p-lg"
    >
      <View className="flex-row items-start justify-between gap-md">
        <View className="flex-1 gap-xs">
          <Text selectable className={`text-lg font-semibold text-neutral-900 ${languageClass}`}>
            {participantName}
          </Text>
          <Text className={`text-sm text-neutral-600 ${languageClass}`}>{participantRole}</Text>
          <Text
            selectable
            className={`text-sm text-neutral-600 ${languageClass}`}
            numberOfLines={1}
          >
            {messagePreview}
          </Text>
        </View>
        {unreadBadge === null ? null : (
          <View
            accessible={false}
            className="min-h-8 min-w-8 items-center justify-center rounded-full bg-primary-600 px-sm"
          >
            <Text style={tabularNumerals} className={`font-bold text-white ${languageClass}`}>
              {unreadBadge}
            </Text>
          </View>
        )}
      </View>
    </PressableScale>
  );
});

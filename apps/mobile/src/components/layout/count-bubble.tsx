/**
 * A count in a circle (RAPP-842): unread messages on the card that opens the
 * chat. The circle is the shape people know for a number that waits for them,
 * so a count never uses the square badge of a word. It is drawn in the brand's
 * dark tone, like the "Nou" badge. Two digits still fit the circle.
 */
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const bubbleStyle = { minWidth: tokens.spacing.xl } as const;

export function CountBubble({ label }: { readonly label: string }) {
  return (
    <View
      className="h-xl items-center justify-center rounded-full bg-primary-dark px-sm"
      style={bubbleStyle}
    >
      <Text className="text-sm font-bold tabular-nums text-white">{label}</Text>
    </View>
  );
}

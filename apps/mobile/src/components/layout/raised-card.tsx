/**
 * The raised card of the player app (RAPP-826): the surface Onboarding uses
 * for its choices, as a card that opens something. A border and a solid edge
 * below it say "this presses", and the face sinks onto the edge on touch.
 * Cards on Inici (a pending form or survey, the next activity, an
 * announcement) share it, so they all look and press the same.
 */
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { forwardSymbol } from '@/components/layout/openable-card';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

interface RaisedCardProps {
  readonly testID?: string;
  readonly accessibilityLabel: string;
  readonly onOpen: () => void;
  /** An icon before the content, drawn in the brand's dark tone with nothing behind it. */
  readonly symbol?: SymbolViewProps['name'];
  /** The forward arrow at the end. Off for a card whose content already fills the row. */
  readonly showsArrow?: boolean;
  readonly children: ReactNode;
}

export function RaisedCard({
  testID,
  accessibilityLabel,
  onOpen,
  symbol,
  showsArrow = true,
  children,
}: RaisedCardProps) {
  return (
    <SelectionChoiceSurface
      testID={testID}
      label={accessibilityLabel}
      accessibilityRole="link"
      onPress={onOpen}
      contentClassName="flex-row items-center gap-md py-md"
    >
      {symbol === undefined ? null : (
        <SymbolView
          accessible={false}
          name={symbol}
          size={tokens.fontSize['3xl']}
          tintColor={tokens.colors.primary.dark}
        />
      )}
      <View className="flex-1 gap-xs">{children}</View>
      {showsArrow ? (
        <SymbolView
          accessible={false}
          name={forwardSymbol}
          size={tokens.fontSize.xl}
          tintColor={tokens.colors.primary.dark}
        />
      ) : null}
    </SelectionChoiceSurface>
  );
}

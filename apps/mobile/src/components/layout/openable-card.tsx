/**
 * A row that either opens something or does not look tappable (X5). With
 * `onOpen` it presses, gives feedback and ends with a forward chevron; without
 * it the same content renders as a plain card, so a dead end never looks like
 * a door.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { I18nManager, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// iOS flips `chevron.forward` itself; the Material glyph needs the direction.
const forwardSymbol: SymbolViewProps['name'] = {
  ios: 'chevron.forward',
  android: I18nManager.isRTL ? 'chevron_left' : 'chevron_right',
  web: I18nManager.isRTL ? 'chevron_left' : 'chevron_right',
};

export function OpenableCard({
  testID,
  accessibilityLabel,
  onOpen,
  className,
  children,
}: {
  readonly testID?: string;
  readonly accessibilityLabel: string;
  /** Leave out when the row has nothing to open. */
  readonly onOpen?: () => void;
  /** The card's surface: border, background, padding. */
  readonly className: string;
  readonly children: ReactNode;
}) {
  if (onOpen === undefined) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={accessibilityLabel}
        style={continuousCorners}
        className={`gap-xs ${className}`}
      >
        {children}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={onOpen}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended flex-row items-center gap-md ${className}`}
    >
      <View className="flex-1 gap-xs">{children}</View>
      <SymbolView
        accessible={false}
        name={forwardSymbol}
        size={tokens.fontSize.lg}
        tintColor={tokens.colors.neutral[500]}
      />
    </PressableScale>
  );
}

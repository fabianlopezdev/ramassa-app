/**
 * A row that either opens something or does not look tappable (X5). With
 * `onOpen` it presses, gives feedback and ends with a forward chevron; without
 * it the same content renders as a plain card, so a dead end never looks like
 * a door.
 */
import { FORWARD_CHEVRON } from '@/components/icons/direction';
import { Icon } from '@/components/icons/icon';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

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
      <Icon name={FORWARD_CHEVRON} size={tokens.fontSize.lg} color={tokens.colors.neutral[500]} />
    </PressableScale>
  );
}

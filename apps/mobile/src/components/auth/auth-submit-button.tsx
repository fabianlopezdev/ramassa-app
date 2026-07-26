/**
 * The primary action button for the auth screens (RAPP-13): a 56dp target, a
 * busy state that disables and shows a spinner (so a slow network can't produce
 * a double submit), and an accessible label + state for screen readers.
 *
 * Retrofitted to `PressableScale` in RAPP-70: press feedback and the haptic
 * vocabulary now come from the shared primitive rather than an `active:opacity`
 * class, so every touchable in the app responds identically and respects
 * reduce-motion. The disabled TREATMENT stays here: that is styling, not motion.
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { ActivityIndicator, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export interface AuthSubmitButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly isLoading?: boolean;
  readonly disabled?: boolean;
}

export function AuthSubmitButton({ label, onPress, isLoading, disabled }: AuthSubmitButtonProps) {
  const languageFontClass = useLanguageFontClass();
  const isBusy = Boolean(isLoading);
  const isInteractionBlocked = Boolean(disabled) || isBusy;

  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={onPress}
      haptic="tapLight"
      isDisabled={Boolean(disabled)}
      isBusy={isBusy}
      style={continuousCorners}
      className={`min-h-recommended justify-center rounded-md bg-primary px-lg ${
        isInteractionBlocked ? 'opacity-60' : ''
      }`}
    >
      <View className="flex-row items-center justify-center gap-sm">
        {isBusy ? <ActivityIndicator color={tokens.colors.white} /> : null}
        <Text className={`text-lg font-bold text-white ${languageFontClass}`}>{label}</Text>
      </View>
    </PressableScale>
  );
}

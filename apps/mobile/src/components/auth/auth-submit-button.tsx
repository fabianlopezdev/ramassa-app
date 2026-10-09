/** Dashboard-themed primary action shared by language selection and login forms. */

import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo } from 'react';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export interface AuthSubmitButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly isLoading?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function AuthSubmitButton({
  label,
  onPress,
  isLoading,
  disabled,
  testID,
}: AuthSubmitButtonProps) {
  const languageFontClass = useLanguageFontClass();
  const { fontScale } = useWindowDimensions();
  const buttonStyle = useMemo(
    () => ({
      ...continuousCorners,
      minHeight: tokens.tapTarget.recommended * Math.max(1, fontScale),
    }),
    [fontScale],
  );
  const isBusy = Boolean(isLoading);
  const isInteractionBlocked = Boolean(disabled) || isBusy;

  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={onPress}
      haptic="tapLight"
      isDisabled={Boolean(disabled)}
      isBusy={isBusy}
      testID={testID}
      style={buttonStyle}
      className={`min-h-recommended justify-center rounded-md bg-primary px-lg ${
        isInteractionBlocked ? 'opacity-60' : ''
      }`}
    >
      <View className="flex-row items-center justify-center gap-sm">
        {isBusy ? <ActivityIndicator accessible={false} color={tokens.colors.white} /> : null}
        <Text className={`text-center text-md font-bold text-white ${languageFontClass}`}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

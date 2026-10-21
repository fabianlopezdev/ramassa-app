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
  const isDisabled = Boolean(disabled);

  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={onPress}
      haptic="tapLight"
      isDisabled={isDisabled}
      isBusy={isBusy}
      testID={testID}
      style={buttonStyle}
      className={`min-h-recommended justify-center rounded-md px-lg ${
        isDisabled ? 'bg-neutral-200' : 'bg-primary'
      }`}
    >
      <View className="flex-row items-center justify-center gap-sm">
        {isBusy ? (
          <ActivityIndicator
            accessible={false}
            color={isDisabled ? tokens.colors.neutral[600] : tokens.colors.white}
          />
        ) : null}
        <Text
          className={`text-center text-form font-bold ${isDisabled ? 'text-neutral-600' : 'text-white'} ${languageFontClass}`}
        >
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

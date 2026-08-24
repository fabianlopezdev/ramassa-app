/** A visual label for tap-first onboarding questions. */

import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export function OnboardingQuestionHeading({
  label,
  symbol,
}: {
  readonly label: string;
  readonly symbol: SymbolViewProps['name'];
}) {
  const languageFontClass = useLanguageFontClass();

  return (
    <View className="flex-row items-center gap-sm">
      <View
        accessible={false}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="h-lg w-lg items-center justify-center rounded-full bg-primary-light"
      >
        <SymbolView
          accessible={false}
          name={symbol}
          size={tokens.fontSize.lg}
          tintColor={tokens.colors.primary.dark}
        />
      </View>
      <Text
        className={`flex-1 text-start text-md font-medium text-neutral-800 ${languageFontClass}`}
      >
        {label}
      </Text>
    </View>
  );
}

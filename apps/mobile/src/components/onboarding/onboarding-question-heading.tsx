/** A visual label for tap-first onboarding questions. */

import { Icon, type IconName } from '@/components/icons/icon';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export function OnboardingQuestionHeading({
  label,
  symbol,
}: {
  readonly label: string;
  readonly symbol?: IconName;
}) {
  const languageFontClass = useLanguageFontClass();

  return (
    <View className="flex-row items-center gap-sm">
      {symbol === undefined ? null : (
        <View
          accessible={false}
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="h-lg w-lg items-center justify-center rounded-full bg-primary-light"
        >
          <Icon name={symbol} size={tokens.fontSize.lg} color={tokens.colors.primary.dark} />
        </View>
      )}
      <Text
        className={`flex-1 text-start text-form font-medium text-neutral-800 ${languageFontClass}`}
      >
        {label}
      </Text>
    </View>
  );
}

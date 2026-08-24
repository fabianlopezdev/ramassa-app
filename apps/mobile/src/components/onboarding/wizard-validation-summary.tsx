/** One calm, screen-reader-announced summary for a rejected wizard submit. */

import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';

export function WizardValidationSummary({
  isVisible,
  message,
}: {
  readonly isVisible: boolean;
  readonly message: string;
}) {
  const languageFontClass = useLanguageFontClass();
  if (!isVisible) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={continuousCorners}
      className="rounded-md bg-error/10 p-md"
    >
      <Text className={`text-start text-md font-medium text-error ${languageFontClass}`}>
        {message}
      </Text>
    </View>
  );
}

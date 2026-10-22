/** One calm, screen-reader-announced summary for a rejected wizard submit. */

import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';

export function WizardValidationSummary({
  isVisible,
  message,
  testID,
}: {
  readonly isVisible: boolean;
  readonly message: string;
  readonly testID?: string;
}) {
  const languageFontClass = useLanguageFontClass();
  if (!isVisible) return null;

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={continuousCorners}
      className="rounded-md bg-error/10 p-md"
    >
      <Text
        selectable
        className={`text-start text-form font-medium text-error ${languageFontClass}`}
      >
        {message}
      </Text>
    </View>
  );
}

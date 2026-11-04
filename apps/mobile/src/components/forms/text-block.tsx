import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';

/**
 * A text she reads: the terms text before she accepts (RAPP-21), on the
 * onboarding terms screen and when a new version asks her again (RAPP-613),
 * and a text block of any form screen (RAPP-770), under its heading when it
 * has one. Selectable, in the form size and her language's font.
 */
export function TextBlock({
  title = '',
  body,
  testID,
}: {
  readonly title?: string;
  readonly body: string;
  readonly testID?: string;
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="gap-sm" testID={testID}>
      {title === '' ? null : (
        <Text
          accessibilityRole="header"
          className={`text-start text-form font-bold text-neutral-900 ${languageFontClass}`}
        >
          {title}
        </Text>
      )}
      <View style={continuousCorners} className="rounded-md bg-neutral-50 p-md">
        <Text
          selectable
          className={`text-start text-form leading-body text-neutral-800 ${languageFontClass}`}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

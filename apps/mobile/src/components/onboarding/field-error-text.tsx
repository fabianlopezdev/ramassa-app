/**
 * The message under a question whose answer is missing or does not fit: the
 * wizard's staff questions (RAPP-610) and the choices staff made required
 * (RAPP-611) say it the same way.
 */
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text } from 'react-native';

export function FieldErrorText({
  message,
  testID,
}: {
  readonly message: string | undefined;
  readonly testID?: string;
}) {
  const fontClass = useLanguageFontClass();
  if (message === undefined) return null;
  return (
    <Text
      selectable
      testID={testID}
      accessibilityLiveRegion="polite"
      className={`text-start text-form text-error ${fontClass}`}
    >
      {message}
    </Text>
  );
}

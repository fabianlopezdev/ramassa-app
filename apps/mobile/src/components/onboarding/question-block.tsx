/**
 * One wizard question with its own "missing" line under it (pending fix 20,
 * RAPP-611). A blocked Continue shows the line under the question that needs
 * an answer, and `useInvalidFieldFocus` brings it into view and gives it the
 * screen reader's focus. Same look as a text field's error.
 */
import type { InvalidFieldFocus } from '@/lib/invalid-field-focus';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function QuestionBlock({
  name,
  testID,
  focus,
  errorMessage,
  className = 'gap-xs',
  children,
}: {
  /** The form field name the validation reports. */
  readonly name: string;
  readonly testID: string;
  readonly focus: InvalidFieldFocus;
  readonly errorMessage?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View ref={focus.block(name)} testID={testID} className={className}>
      {children}
      {errorMessage === undefined ? null : (
        <Text
          ref={focus.error(name)}
          selectable
          accessibilityLiveRegion="polite"
          className={`text-start text-form text-error ${fontClass}`}
        >
          {errorMessage}
        </Text>
      )}
    </View>
  );
}

import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text } from 'react-native';

/** The shared raised surface as an action, without a selected state or fill. */
export function RaisedActionButton({
  label,
  onPress,
  testID,
  accessibilityLabel,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <SelectionChoiceSurface
      label={accessibilityLabel ?? label}
      onPress={onPress}
      testID={testID}
      contentClassName="items-center justify-center"
    >
      <Text className={`text-center text-form font-medium text-primary ${fontClass}`}>{label}</Text>
    </SelectionChoiceSurface>
  );
}

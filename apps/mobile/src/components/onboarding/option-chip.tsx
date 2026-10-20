import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text } from 'react-native';

export interface OptionChipProps {
  readonly testID?: string;
  readonly label: string;
  readonly accessibilityHint?: string;
  readonly isSelected: boolean;
  readonly onPress: () => void;
}

export function OptionChip({
  testID,
  label,
  accessibilityHint,
  isSelected,
  onPress,
}: OptionChipProps) {
  const languageFontClass = useLanguageFontClass();
  return (
    <SelectionChoiceSurface
      testID={testID}
      label={label}
      accessibilityHint={accessibilityHint}
      isSelected={isSelected}
      onPress={onPress}
      contentClassName="justify-center"
    >
      <Text
        className={`text-center text-form text-primary ${isSelected ? 'font-bold' : 'font-medium'} ${languageFontClass}`}
      >
        {label}
      </Text>
    </SelectionChoiceSurface>
  );
}

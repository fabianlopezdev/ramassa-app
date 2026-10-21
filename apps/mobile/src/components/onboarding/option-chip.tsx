import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text } from 'react-native';

export interface OptionChipProps {
  readonly testID?: string;
  readonly label: string;
  readonly accessibilityHint?: string;
  readonly accessibilityRole?: 'button' | 'radio';
  readonly isSelected: boolean;
  readonly onPress: () => void;
}

export function OptionChip({
  testID,
  label,
  accessibilityHint,
  accessibilityRole = 'button',
  isSelected,
  onPress,
}: OptionChipProps) {
  const languageFontClass = useLanguageFontClass();
  return (
    <SelectionChoiceSurface
      testID={testID}
      label={label}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      isSelected={isSelected}
      onPress={onPress}
      contentClassName="justify-center"
    >
      <Text
        className={`text-center text-form font-medium ${isSelected ? 'text-neutral-900' : 'text-primary-dark'} ${languageFontClass}`}
      >
        {label}
      </Text>
    </SelectionChoiceSurface>
  );
}

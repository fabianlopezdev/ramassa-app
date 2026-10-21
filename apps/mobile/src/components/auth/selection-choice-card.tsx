import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { DrawnCheckmark } from '@/components/motion/drawn-checkmark';
import { Text, type StyleProp, type ViewStyle } from 'react-native';

/** Shared language and document-choice card with the same press and selection feedback. */
export function SelectionChoiceCard({
  testID,
  label,
  language,
  fontClass,
  isSelected,
  rowStyle,
  onPress,
  accessibilityRole = 'radio',
}: {
  readonly testID?: string;
  readonly label: string;
  readonly language?: string;
  readonly fontClass: string;
  readonly isSelected: boolean;
  readonly rowStyle?: StyleProp<ViewStyle>;
  readonly onPress: () => void;
  readonly accessibilityRole?: 'radio' | 'checkbox';
}) {
  return (
    <SelectionChoiceSurface
      testID={testID}
      label={label}
      accessibilityLanguage={language}
      accessibilityRole={accessibilityRole}
      isSelected={isSelected}
      onPress={onPress}
      className="w-full"
      rowStyle={rowStyle}
      contentClassName="w-full flex-row items-center justify-between"
    >
      <Text
        accessibilityLanguage={language}
        className={`flex-1 text-start text-form font-medium ${isSelected ? 'text-neutral-900' : 'text-primary-dark'} ${fontClass}`}
      >
        {label}
      </Text>
      <DrawnCheckmark active={isSelected} />
    </SelectionChoiceSurface>
  );
}

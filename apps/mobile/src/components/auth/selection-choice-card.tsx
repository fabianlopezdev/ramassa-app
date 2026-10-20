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
}: {
  readonly testID?: string;
  readonly label: string;
  readonly language?: string;
  readonly fontClass: string;
  readonly isSelected: boolean;
  readonly rowStyle: StyleProp<ViewStyle>;
  readonly onPress: () => void;
}) {
  return (
    <SelectionChoiceSurface
      testID={testID}
      label={label}
      accessibilityRole="radio"
      isSelected={isSelected}
      onPress={onPress}
      className="w-full"
      rowStyle={rowStyle}
      contentClassName="w-full flex-row items-center justify-between"
    >
      <Text
        accessibilityLanguage={language}
        className={`flex-1 text-start text-form font-medium text-primary ${fontClass}`}
      >
        {label}
      </Text>
      <DrawnCheckmark active={isSelected} />
    </SelectionChoiceSurface>
  );
}

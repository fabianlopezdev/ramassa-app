import { FIELD_SHAPE_CLASS_NAME } from '@/components/forms/field-appearance';
import { DrawnCheckmark } from '@/components/motion/drawn-checkmark';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { continuousCorners } from '@/lib/continuous-corners';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const ROW_CLASS = `relative w-full flex-row items-center justify-between overflow-hidden ${FIELD_SHAPE_CLASS_NAME} border-primary px-lg`;
const wrapperStyle = {
  paddingEnd: tokens.languageChoice.shadowInlineOffset,
  paddingBottom: tokens.languageChoice.shadowBlockOffset,
} as const;
const shadowStyle = {
  ...continuousCorners,
  position: 'absolute',
  top: tokens.languageChoice.shadowBlockOffset,
  start: tokens.languageChoice.shadowInlineOffset,
  end: 0,
  bottom: 0,
} as const;

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
    <PressableDepth
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="radio"
      isSelected={isSelected}
      onPress={onPress}
      haptic="selection"
      style={wrapperStyle}
      className="relative w-full"
      faceStyle={rowStyle}
      faceClassName={`${ROW_CLASS} bg-white`}
      inlineOffset={tokens.languageChoice.shadowInlineOffset}
      blockOffset={tokens.languageChoice.shadowBlockOffset}
      shadow={<View pointerEvents="none" className="rounded-lg bg-primary" style={shadowStyle} />}
    >
      <SelectionTransition
        active={isSelected}
        duration="base"
        className="absolute inset-0 bg-secondary"
        style={continuousCorners}
      />
      <Text
        accessibilityLanguage={language}
        className={`flex-1 text-start text-form font-medium text-primary ${fontClass}`}
      >
        {label}
      </Text>
      <DrawnCheckmark active={isSelected} />
    </PressableDepth>
  );
}

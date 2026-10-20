import { useFormFieldAppearance } from '@/components/forms/field-appearance';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';

interface RadioOptionProps {
  readonly label: string;
  readonly accessibilityHint?: string;
  readonly isSelected: boolean;
  readonly onPress: () => void;
}

/** A single answer, with a visible radio indicator and the shared accessible target height. */
export function RadioOption({ label, accessibilityHint, isSelected, onPress }: RadioOptionProps) {
  const fontClass = useLanguageFontClass();
  const appearance = useFormFieldAppearance();
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      isSelected={isSelected}
      onPress={onPress}
      haptic="selection"
      style={appearance.style}
      className="flex-row items-center gap-md py-sm"
    >
      <View
        className={
          isSelected
            ? 'h-6 w-6 items-center justify-center rounded-full border-2 border-primary'
            : 'h-6 w-6 items-center justify-center rounded-full border-2 border-neutral-500'
        }
      >
        {isSelected ? <View className="h-3 w-3 rounded-full bg-primary" /> : null}
      </View>
      <Text className={`flex-1 text-start text-form text-neutral-900 ${fontClass}`}>{label}</Text>
    </PressableScale>
  );
}

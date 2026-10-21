/** Shared picker surface for each explicit authorization checkbox. */
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { DrawnCheckmark } from '@/components/motion/drawn-checkmark';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';

export function ConsentRow({
  label,
  required,
  requiredMark,
  checked,
  onToggle,
  testID,
}: {
  readonly label: string;
  readonly required: boolean;
  readonly requiredMark: string;
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly testID: string;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <SelectionChoiceSurface
      testID={testID}
      accessibilityRole="checkbox"
      isSelected={checked}
      label={required ? `${label} (${requiredMark})` : label}
      onPress={onToggle}
      contentClassName="flex-row items-center gap-md py-md"
    >
      <View
        style={continuousCorners}
        className="h-6 w-6 items-center justify-center rounded border-2 border-primary"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <DrawnCheckmark active={checked} />
      </View>
      <View className="flex-1 gap-xs">
        <Text
          className={`text-start text-form font-medium ${checked ? 'text-neutral-900' : 'text-primary-dark'} ${fontClass}`}
        >
          {label}
        </Text>
        {required ? (
          <Text
            className={`text-start text-form font-bold ${checked ? 'text-neutral-900' : 'text-primary-dark'} ${fontClass}`}
          >
            {requiredMark}
          </Text>
        ) : null}
      </View>
    </SelectionChoiceSurface>
  );
}

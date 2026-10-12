/** One choice in a group of radio options (item, size, mode, condition). */
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { memo, useCallback } from 'react';
import { Pressable, Text } from 'react-native';

function ChoiceOptionView<Value extends string>({
  value,
  label,
  selected,
  onSelect,
  testID,
  languageFontClass,
}: {
  readonly value: Value;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (value: Value) => void;
  readonly testID: string;
  readonly languageFontClass: string;
}) {
  const select = useCallback(() => {
    playHaptic('selection');
    onSelect(value);
  }, [onSelect, value]);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={label}
      // aria-checked: react-native-web drops accessibilityState.checked.
      aria-checked={selected}
      aria-selected={selected}
      onPress={select}
      style={continuousCorners}
      className={`min-h-recommended min-w-recommended items-center justify-center rounded-md border px-md active:opacity-90 ${
        selected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
      }`}
    >
      <Text
        className={`text-center font-semibold ${selected ? 'text-white' : 'text-neutral-800'} ${languageFontClass}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export const ChoiceOption = memo(ChoiceOptionView) as typeof ChoiceOptionView;

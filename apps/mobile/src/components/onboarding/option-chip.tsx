/**
 * A selectable option chip for the wizard (RAPP-21): the tap-first answer
 * control for everything enumerable (document type, sizes, yes/no, language).
 * Chips instead of dropdowns because every option is VISIBLE at once, which is
 * the single biggest comprehension win for a low-literacy audience: nothing is
 * hidden behind an interaction that has to be known about.
 *
 * 56dp minimum target (recommended, not just the 48dp floor) and the selected
 * state is ANNOUNCED via accessibilityState, not just painted: a state that is
 * only a background colour is invisible to a screen reader, and to the QA
 * suite that has to verify which option a tap actually landed on (the RAPP-20
 * lesson, learned twice).
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text } from 'react-native';

export interface OptionChipProps {
  readonly label: string;
  readonly isSelected: boolean;
  readonly onPress: () => void;
}

export function OptionChip({ label, isSelected, onPress }: OptionChipProps) {
  const languageFontClass = useLanguageFontClass();
  return (
    <PressableScale
      accessibilityLabel={label}
      isSelected={isSelected}
      onPress={onPress}
      haptic="selection"
      style={continuousCorners}
      className={`min-h-recommended justify-center rounded-md border px-lg ${
        isSelected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
      }`}
    >
      <Text
        className={`text-center text-md font-medium ${
          isSelected ? 'text-white' : 'text-neutral-800'
        } ${languageFontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

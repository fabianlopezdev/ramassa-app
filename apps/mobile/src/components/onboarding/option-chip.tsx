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

/**
 * The two appearances as hoisted constants rather than a template literal
 * rebuilt on every render (contract rule 17's perf clause). Worth naming here
 * and not only for tidiness: the longest screens render a dozen-odd chips at
 * once and re-render them together whenever a watched field changes.
 *
 * Spelled out in full rather than composed from a shared base, so Tailwind's
 * scanner still sees every utility as a literal in this file.
 */
const CHIP_CLASS =
  'min-h-recommended justify-center rounded-md border border-neutral-300 bg-white px-lg';
const CHIP_SELECTED_CLASS =
  'min-h-recommended justify-center rounded-md border border-primary bg-primary/10 px-lg';
const CHIP_LABEL_CLASS = 'text-center text-md font-medium text-neutral-800';
const CHIP_LABEL_SELECTED_CLASS = 'text-center text-md font-bold text-primary-dark';

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
    <PressableScale
      testID={testID}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      isSelected={isSelected}
      onPress={onPress}
      haptic="selection"
      style={continuousCorners}
      className={isSelected ? CHIP_SELECTED_CLASS : CHIP_CLASS}
    >
      <Text
        className={`${isSelected ? CHIP_LABEL_SELECTED_CLASS : CHIP_LABEL_CLASS} ${languageFontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

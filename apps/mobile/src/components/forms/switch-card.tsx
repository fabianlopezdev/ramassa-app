/**
 * A switch in a raised card (RAPP-891): its text at the start and the switch
 * at the end, on the face the choice cards use. The whole card turns the
 * switch, so the switch keeps the platform's size and the card is the tap
 * target. The card speaks as the switch; the drawn switch stays silent.
 */
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Switch, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const switchTrackColor = {
  false: tokens.colors.neutral[300],
  true: tokens.colors.primary.DEFAULT,
} as const;

export function SwitchCard({
  testID,
  label,
  value,
  onToggle,
}: {
  readonly testID?: string;
  readonly label: string;
  readonly value: boolean;
  readonly onToggle: () => void;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <SelectionChoiceSurface
      testID={testID}
      accessibilityRole="switch"
      isSelected={value}
      label={label}
      onPress={onToggle}
      className="w-full"
      contentClassName="w-full flex-row items-center justify-between gap-md py-md"
    >
      <Text
        className={`flex-1 text-start text-form font-medium ${value ? 'text-neutral-900' : 'text-primary-dark'} ${fontClass}`}
      >
        {label}
      </Text>
      <View
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch value={value} trackColor={switchTrackColor} />
      </View>
    </SelectionChoiceSurface>
  );
}

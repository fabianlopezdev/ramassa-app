/**
 * A switch in a raised card (RAPP-891), the one way the app draws a switch
 * (RAPP-894): its text at the start and the switch at the end, on the raised
 * face the choice cards use. The whole card turns the switch, so the switch
 * keeps the platform's size and the card is the tap target. The card speaks
 * as the switch; the drawn switch stays silent.
 *
 * The face stays white when the switch is on, because the switch already
 * shows it and a long list of switches would otherwise turn into a wall of
 * the chosen colour.
 *
 * A card may carry a second line under its label, such as what a permission
 * allows. The switch turns on in the organization's brand colour, the colour
 * of the card's border and edge. A locked card dims and a press does nothing, like a raised button
 * that waits. A bold label names a group, such as an area of permissions.
 */
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { RaisedPressable, useRaisedChoiceFaceStyle } from '@/components/layout/raised-surface';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback, useMemo } from 'react';
import { Switch, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const labelWeightClasses = { medium: 'font-medium', bold: 'font-bold' } as const;

export function SwitchCard({
  testID,
  label,
  description,
  accessibilityLabel,
  accessibilityHint,
  value,
  onValueChange,
  isDisabled = false,
  labelWeight = 'medium',
}: {
  readonly testID?: string;
  readonly label: string;
  /** A second line under the label. */
  readonly description?: string;
  /** What a screen reader says in place of the label. */
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  /** A switch she may not turn: the card dims and a press does nothing. */
  readonly isDisabled?: boolean;
  /** `bold` for the switch of a whole group. */
  readonly labelWeight?: keyof typeof labelWeightClasses;
}) {
  const fontClass = useLanguageFontClass();
  const faceStyle = useRaisedChoiceFaceStyle();
  const brandColor = useBrandColor();
  const trackColor = useMemo(
    () => ({ false: tokens.colors.neutral[300], true: brandColor }),
    [brandColor],
  );
  const handlePress = useCallback(() => {
    if (!isDisabled) onValueChange(!value);
  }, [isDisabled, onValueChange, value]);
  return (
    <RaisedPressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      isSelected={value}
      onPress={handlePress}
      className={isDisabled ? 'opacity-50' : undefined}
      faceStyle={faceStyle}
      faceClassName="flex-row items-center justify-between gap-md px-lg py-md"
    >
      <View className="flex-1 gap-xs">
        <Text
          className={`text-start text-form text-primary-dark ${labelWeightClasses[labelWeight]} ${fontClass}`}
        >
          {label}
        </Text>
        {description === undefined ? null : (
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{description}</Text>
        )}
      </View>
      <View
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch value={value} trackColor={trackColor} />
      </View>
    </RaisedPressable>
  );
}

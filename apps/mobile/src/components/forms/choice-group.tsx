/**
 * A question answered with one tap: its label, then its choices wrapping in a
 * row (RAPP-889). One piece for the profile, the handover, the checkout and the
 * filter sheets, so every choice group sits the same distance from its label.
 */
import { FieldLabel } from '@/components/forms/field-label';
import type { ReactNode } from 'react';
import { View } from 'react-native';

interface ChoiceGroupProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly testID?: string;
}

export function ChoiceGroup({ label, children, testID }: ChoiceGroupProps) {
  return (
    <View testID={testID} className="gap-xs">
      <FieldLabel>{label}</FieldLabel>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-sm"
      >
        {children}
      </View>
    </View>
  );
}

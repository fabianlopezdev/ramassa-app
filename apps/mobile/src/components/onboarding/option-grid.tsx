import { OptionChip } from '@/components/onboarding/option-chip';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/** Reserve room for a three-character size label, without reducing readable text. */
export function optionGridColumnCount(availableWidth: number, fontScale: number): number {
  const minimumCellWidth =
    tokens.spacing.lg * 2 + tokens.fontSize.form * Math.max(1, fontScale) * 3;
  return Math.max(
    1,
    Math.min(
      3,
      Math.floor((availableWidth + tokens.spacing.sm) / (minimumCellWidth + tokens.spacing.sm)),
    ),
  );
}

interface OptionGridProps {
  readonly options: readonly string[];
  readonly value: string;
  readonly accessibilityHint: string;
  readonly onChange: (value: string) => void;
}

/** Fixed column tracks keep all size buttons equal, including the final incomplete row. */
export function OptionGrid({ options, value, accessibilityHint, onChange }: OptionGridProps) {
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const columns = optionGridColumnCount(measuredWidth ?? width - tokens.spacing.lg * 2, fontScale);
  const rows = Array.from({ length: Math.ceil(options.length / columns) }, (_, row) =>
    Array.from({ length: columns }, (_, column) => options[row * columns + column]),
  );
  return (
    <View className="gap-sm" onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}>
      {rows.map((row) => (
        <View key={row[0]} className="flex-row gap-sm">
          {row.map((option, index) => (
            <View key={option ?? `empty-${index}`} className="flex-1">
              {option === undefined ? null : (
                <OptionChip
                  label={option}
                  accessibilityHint={accessibilityHint}
                  isSelected={value === option}
                  onPress={() => onChange(option)}
                />
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

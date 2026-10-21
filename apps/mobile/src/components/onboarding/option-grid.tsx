import { OptionChip } from '@/components/onboarding/option-chip';
import { Children, useState, type ReactNode } from 'react';
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

/** Fixed column tracks also serve custom questions with translated option labels. */
export function ChoiceGrid({
  children,
  maximumColumns = 3,
}: {
  readonly children: ReactNode;
  readonly maximumColumns?: 2 | 3;
}) {
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const items = Children.toArray(children);
  const columns = Math.min(
    maximumColumns,
    Math.max(1, items.length),
    optionGridColumnCount(measuredWidth ?? width - tokens.spacing.lg * 2, fontScale),
  );
  const rows = Array.from({ length: Math.ceil(items.length / columns) }, (_, row) =>
    Array.from({ length: columns }, (_, column) => items[row * columns + column]),
  );
  return (
    <View className="gap-sm" onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-sm">
          {row.map((option, index) => (
            <View key={index} className="flex-1">
              {option ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function OptionGrid({ options, value, accessibilityHint, onChange }: OptionGridProps) {
  return (
    <ChoiceGrid>
      {options.map((option) => (
        <OptionChip
          key={option}
          label={option}
          accessibilityHint={accessibilityHint}
          isSelected={value === option}
          onPress={() => onChange(option)}
        />
      ))}
    </ChoiceGrid>
  );
}

/**
 * A row of filter chips (RAPP-829): raised like the cards, so they read as
 * something to press, with the chosen one filled. The row scrolls sideways
 * and runs to the edge of the screen, where a cut-off chip shows there are
 * more. The announcement categories on Inici and the activity categories on
 * Activitats share it. A chip may take the colour of what it filters
 * (RAPP-845), such as the kind of an announcement.
 */
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import {
  RAISED_FACE_MIN_HEIGHT,
  raisedToneClassNames,
  type RaisedTone,
} from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { memo, useCallback } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  // The row leaves the page's side padding and takes it back inside, so the
  // first chip lines up with the cards and the last can scroll under the edge.
  row: { marginHorizontal: -tokens.spacing.lg },
  rowContent: { gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
});
const chipStyle = {
  ...continuousCorners,
  minHeight: RAISED_FACE_MIN_HEIGHT,
} as const;

export interface FilterChipOption<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly testID?: string;
  readonly tone?: RaisedTone;
}

function chipTextClassName(tone: RaisedTone | undefined, isSelected: boolean): string {
  if (tone === undefined) return isSelected ? 'text-neutral-900' : 'text-primary-dark';
  const classes = raisedToneClassNames(tone);
  return isSelected ? classes.filledText : classes.text;
}

interface FilterChipProps<Id extends string> extends FilterChipOption<Id> {
  readonly isSelected: boolean;
  readonly languageFontClass: string;
  readonly onSelect: (id: Id) => void;
}

function FilterChipInner<Id extends string>({
  id,
  label,
  testID,
  tone,
  isSelected,
  languageFontClass,
  onSelect,
}: FilterChipProps<Id>) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <SelectionChoiceSurface
      testID={testID}
      label={label}
      accessibilityRole="radio"
      isSelected={isSelected}
      onPress={handlePress}
      contentClassName="justify-center"
      rowStyle={chipStyle}
      tone={tone}
    >
      <Text
        className={`text-center text-md font-bold ${chipTextClassName(
          tone,
          isSelected,
        )} ${languageFontClass}`}
      >
        {label}
      </Text>
    </SelectionChoiceSurface>
  );
}
const FilterChip = memo(FilterChipInner) as typeof FilterChipInner;

export function FilterChips<Id extends string>({
  options,
  selected,
  accessibilityLabel,
  languageFontClass,
  onSelect,
}: {
  readonly options: readonly FilterChipOption<Id>[];
  readonly selected: Id;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly onSelect: (id: Id) => void;
}) {
  return (
    <ScrollView
      horizontal
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.rowContent}
    >
      {options.map((option) => (
        <FilterChip
          key={option.id}
          {...option}
          isSelected={selected === option.id}
          languageFontClass={languageFontClass}
          onSelect={onSelect}
        />
      ))}
    </ScrollView>
  );
}

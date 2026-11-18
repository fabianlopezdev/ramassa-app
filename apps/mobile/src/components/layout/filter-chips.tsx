/**
 * A row of filter chips (RAPP-829): raised like the cards, so they read as
 * something to press, with the chosen one filled. The row scrolls sideways
 * and runs to the edge of the screen, where a cut-off chip shows there are
 * more. The announcement categories on Inici and the activity categories on
 * Activitats share it. A chip may take the colour of what it filters
 * (RAPP-845), such as the kind of an announcement, as a pale wash on its
 * face. Its border and edge stay in the brand, and a chosen chip fills with
 * the secondary colour, like every other chip.
 *
 * A chip may carry a count on its top edge, in the circle cards use for one
 * (RAPP-848): the new announcements of a kind. When any chip has one, every
 * chip keeps the room above it, so the row stays level.
 */
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { EdgeMarks } from '@/components/layout/edge-marks';
import { RAISED_FACE_MIN_HEIGHT, type RaisedTone } from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { memo, useCallback } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const rowContent = { gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg } as const;
const styles = StyleSheet.create({
  // The row leaves the page's side padding and takes it back inside, so the
  // first chip lines up with the cards and the last can scroll under the edge.
  row: { marginHorizontal: -tokens.spacing.lg },
  rowContent,
  // The count circle rises above the room `EdgeMarks` keeps, and the row
  // would clip it, so the row keeps the rest.
  rowContentWithCounts: { ...rowContent, paddingTop: tokens.spacing.sm },
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
  /** A number on the chip's top edge, such as its new items. */
  readonly count?: string | null;
  /** What is read out, when it says more than the label, such as the count. */
  readonly accessibilityLabel?: string;
}

function chipTextClassName(tone: RaisedTone | undefined, isSelected: boolean): string {
  // A chosen chip fills with the secondary colour, and a tinted one reads in
  // dark text, so only a plain chip that is not chosen uses the brand's dark.
  return isSelected || tone !== undefined ? 'text-neutral-900' : 'text-primary-dark';
}

interface FilterChipProps<Id extends string> extends FilterChipOption<Id> {
  readonly hasMarks: boolean;
  readonly isSelected: boolean;
  readonly languageFontClass: string;
  readonly onSelect: (id: Id) => void;
}

function FilterChipInner<Id extends string>({
  id,
  label,
  testID,
  tone,
  count = null,
  accessibilityLabel,
  hasMarks,
  isSelected,
  languageFontClass,
  onSelect,
}: FilterChipProps<Id>) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  const chip = (
    <SelectionChoiceSurface
      testID={testID}
      label={accessibilityLabel ?? label}
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
  if (!hasMarks) return chip;
  return <EdgeMarks count={count}>{chip}</EdgeMarks>;
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
  const hasMarks = options.some((option) => option.count !== undefined && option.count !== null);
  return (
    <ScrollView
      horizontal
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={hasMarks ? styles.rowContentWithCounts : styles.rowContent}
    >
      {options.map((option) => (
        <FilterChip
          key={option.id}
          {...option}
          hasMarks={hasMarks}
          isSelected={selected === option.id}
          languageFontClass={languageFontClass}
          onSelect={onSelect}
        />
      ))}
    </ScrollView>
  );
}

/**
 * One choice in a group of radio options (item, size, mode, condition): the
 * raised pill every filter in the app shares (RAPP-878).
 */
import { RaisedChip } from '@/components/layout/filter-chips';
import { memo, useCallback } from 'react';

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
  const select = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <RaisedChip
      testID={testID}
      label={label}
      isSelected={selected}
      onPress={select}
      languageFontClass={languageFontClass}
    />
  );
}

export const ChoiceOption = memo(ChoiceOptionView) as typeof ChoiceOptionView;

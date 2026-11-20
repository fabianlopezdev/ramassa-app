/**
 * One row of a staff list: More's entries (RAPP-796) and Avui's "Pendent" list
 * (RAPP-795). One line and an optional value at the end. A row that opens
 * something is the raised card (RAPP-878), with its forward arrow; a row
 * without `onPress` is plain text and does not look tappable.
 */
import { RaisedCard } from '@/components/layout/raised-card';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback, type ReactNode } from 'react';
import { Text, View } from 'react-native';

export function TeamListRow({
  testID,
  label,
  value,
  isValueHighlighted = false,
  accessibilityHint,
  onPress,
  isBusy = false,
  tone = 'default',
  children,
}: {
  readonly testID: string;
  readonly label: string;
  /** Shown at the end of the row, for example a count. */
  readonly value?: string;
  readonly isValueHighlighted?: boolean;
  readonly accessibilityHint?: string;
  readonly onPress?: () => void;
  /** While its action runs, a press does nothing. */
  readonly isBusy?: boolean;
  /** `action`: a command such as sign-out, with no arrow because it opens no screen. */
  readonly tone?: 'default' | 'action';
  /** Extra lines under the row, for rows whose detail has no screen of its own. */
  readonly children?: ReactNode;
}) {
  const fontClass = useLanguageFontClass();
  const handlePress = useCallback(() => {
    if (!isBusy) onPress?.();
  }, [isBusy, onPress]);
  const isOpenable = onPress !== undefined;
  const line = (
    <View className="flex-row items-center gap-sm">
      <Text
        className={`flex-1 text-start text-form ${
          isOpenable ? 'font-bold text-primary-dark' : 'text-neutral-900'
        } ${fontClass}`}
      >
        {label}
      </Text>
      {value === undefined ? null : (
        <Text
          className={`text-end text-form tabular-nums ${
            isValueHighlighted ? 'font-bold text-primary-dark' : 'text-neutral-600'
          } ${fontClass}`}
        >
          {value}
        </Text>
      )}
    </View>
  );
  const accessibilityLabel = value === undefined ? label : `${label}, ${value}`;
  if (!isOpenable) {
    // The side padding of a card's face, so its words line up with the cards around it.
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={accessibilityLabel}
        className="min-h-recommended justify-center gap-xs px-lg"
      >
        {line}
        {children}
      </View>
    );
  }
  return (
    <RaisedCard
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      showsArrow={tone !== 'action'}
      onOpen={handlePress}
    >
      {line}
      {children}
    </RaisedCard>
  );
}

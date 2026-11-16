/**
 * One row inside a headed group card (`ProfileSection`): More's entries
 * (RAPP-796) and Avui's "Pendent" list (RAPP-795). One line, an optional value
 * at the end, and a forward chevron when it opens something. A row without
 * `onPress` does not look tappable.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const forwardSymbol = {
  ios: 'chevron.forward',
  android: 'chevron_right',
  web: 'chevron_right',
} as const;

export function TeamListRow({
  testID,
  label,
  value,
  isValueHighlighted = false,
  accessibilityHint,
  onPress,
  isBusy,
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
  readonly isBusy?: boolean;
  /** `action`: a command such as sign-out, in the primary colour. */
  readonly tone?: 'default' | 'action';
  /** Extra lines under the row, for rows whose detail has no screen of its own. */
  readonly children?: ReactNode;
}) {
  const fontClass = useLanguageFontClass();
  const line = (
    <View className="min-h-recommended flex-row items-center gap-sm">
      <Text
        className={`flex-1 text-start text-md ${
          tone === 'action' ? 'font-semibold text-primary-dark' : 'text-neutral-900'
        } ${fontClass}`}
      >
        {label}
      </Text>
      {value === undefined ? null : (
        <Text
          className={`text-end text-md tabular-nums ${
            isValueHighlighted ? 'font-bold text-primary-dark' : 'text-neutral-600'
          } ${fontClass}`}
        >
          {value}
        </Text>
      )}
      {onPress === undefined || tone === 'action' ? null : (
        <SymbolView
          accessible={false}
          name={forwardSymbol}
          size={tokens.fontSize.lg}
          tintColor={tokens.colors.neutral[500]}
        />
      )}
    </View>
  );
  const accessibilityLabel = value === undefined ? label : `${label}, ${value}`;
  if (onPress === undefined) {
    return (
      <View testID={testID} accessible accessibilityLabel={accessibilityLabel} className="gap-xs">
        {line}
        {children}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      isBusy={isBusy}
      haptic="selection"
      className="gap-xs"
    >
      {line}
      {children}
    </PressableScale>
  );
}

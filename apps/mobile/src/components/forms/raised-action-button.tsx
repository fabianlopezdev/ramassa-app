/**
 * The shared raised surface as an action, without a selected state or fill.
 *
 * `size="full"` (the default) runs the width of the screen. `size="compact"`
 * (RAPP-867) is sized to its words with an optional icon, for a secondary
 * action under something bigger, such as "Ara no" and "Elimina" under a form.
 * A compact button sits under the end of what it acts on, outside it
 * (RAPP-876). `tone="danger"` reads in red on the pale red face of an urgent announcement;
 * the border and edge stay in the brand, like every raised control.
 */
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { Icon, type IconName } from '@/components/icons/icon';
import { RAISED_COMPACT_FACE_MIN_HEIGHT } from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback } from 'react';
import { Text } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const compactFaceStyle = {
  ...continuousCorners,
  minHeight: RAISED_COMPACT_FACE_MIN_HEIGHT,
} as const;

const toneStyles = {
  brand: { text: 'text-primary', icon: tokens.colors.primary.DEFAULT, wash: undefined },
  danger: { text: 'text-error', icon: tokens.colors.error, wash: 'error' },
} as const;

export function RaisedActionButton({
  label,
  onPress,
  testID,
  accessibilityLabel,
  size = 'full',
  icon,
  tone = 'brand',
  isDisabled = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly size?: 'full' | 'compact';
  /** An icon before the words. */
  readonly icon?: IconName;
  readonly tone?: keyof typeof toneStyles;
  /** While its action runs, a press does nothing. */
  readonly isDisabled?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  const styles = toneStyles[tone];
  const handlePress = useCallback(() => {
    if (!isDisabled) onPress();
  }, [isDisabled, onPress]);
  const isCompact = size === 'compact';
  return (
    <SelectionChoiceSurface
      label={accessibilityLabel ?? label}
      onPress={handlePress}
      testID={testID}
      className={isCompact ? 'self-end' : undefined}
      paddingClassName={isCompact ? 'px-md' : undefined}
      rowStyle={isCompact ? compactFaceStyle : undefined}
      contentClassName="flex-row items-center justify-center gap-sm"
      tone={styles.wash}
    >
      {icon === undefined ? null : (
        <Icon
          name={icon}
          weight="boldDuotone"
          size={isCompact ? tokens.fontSize.xl : tokens.fontSize['2xl']}
          color={styles.icon}
        />
      )}
      <Text
        className={`text-center ${isCompact ? 'text-md font-bold' : 'text-form font-medium'} ${styles.text} ${fontClass}`}
      >
        {label}
      </Text>
    </SelectionChoiceSurface>
  );
}

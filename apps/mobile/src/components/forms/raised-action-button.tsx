/**
 * The shared raised surface as an action, without a selected state or fill.
 *
 * `size="full"` (the default) runs the width of the screen. `size="compact"`
 * (RAPP-867) is sized to its words with an optional icon, for a secondary
 * action under something bigger, such as "Ara no" and "Elimina" under a form.
 * A compact button sits under the end of what it acts on, outside it
 * (RAPP-876). `size="fit"` (RAPP-878) is also sized to its words, at the height
 * of a recommended tap target, for the main action beside a field, such as
 * Send beside the chat composer. `tone="danger"` reads in red on the pale red face of an urgent announcement;
 * the border and edge stay in the brand, like every raised control.
 */
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { Icon, type IconName } from '@/components/icons/icon';
import {
  RAISED_COMPACT_FACE_MIN_HEIGHT,
  RAISED_FACE_MIN_HEIGHT,
} from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback } from 'react';
import { Text } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const compactFaceStyle = {
  ...continuousCorners,
  minHeight: RAISED_COMPACT_FACE_MIN_HEIGHT,
} as const;
const fitFaceStyle = {
  ...continuousCorners,
  minHeight: RAISED_FACE_MIN_HEIGHT,
} as const;
const wordSizedFaceStyles = { compact: compactFaceStyle, fit: fitFaceStyle } as const;

const toneStyles = {
  brand: { text: 'text-primary', icon: tokens.colors.primary.DEFAULT, wash: undefined },
  danger: { text: 'text-error', icon: tokens.colors.error, wash: 'error' },
} as const;

export function RaisedActionButton({
  label,
  onPress,
  testID,
  accessibilityLabel,
  accessibilityRole = 'button',
  size = 'full',
  icon,
  tone = 'brand',
  isDisabled = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  /** `link` when it opens something outside the screen, such as a map. */
  readonly accessibilityRole?: 'button' | 'link';
  readonly size?: 'full' | 'compact' | 'fit';
  /** An icon before the words. */
  readonly icon?: IconName;
  readonly tone?: keyof typeof toneStyles;
  /** While its action runs, or until it may run, a press does nothing and the button dims. */
  readonly isDisabled?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  const styles = toneStyles[tone];
  const handlePress = useCallback(() => {
    if (!isDisabled) onPress();
  }, [isDisabled, onPress]);
  const isWordSized = size !== 'full';
  return (
    <SelectionChoiceSurface
      label={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      onPress={handlePress}
      testID={testID}
      className={`${isWordSized ? 'self-end' : ''} ${isDisabled ? 'opacity-50' : ''}`}
      paddingClassName={isWordSized ? 'px-md' : undefined}
      rowStyle={size === 'full' ? undefined : wordSizedFaceStyles[size]}
      contentClassName="flex-row items-center justify-center gap-sm"
      tone={styles.wash}
    >
      {icon === undefined ? null : (
        <Icon
          name={icon}
          weight="boldDuotone"
          size={isWordSized ? tokens.fontSize.xl : tokens.fontSize['2xl']}
          color={styles.icon}
        />
      )}
      <Text
        className={`text-center ${isWordSized ? 'text-md font-bold' : 'text-form font-medium'} ${styles.text} ${fontClass}`}
      >
        {label}
      </Text>
    </SelectionChoiceSurface>
  );
}

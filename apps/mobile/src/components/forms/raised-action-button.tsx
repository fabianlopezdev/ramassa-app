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
  RAISED_ICON_FACE_SIZES,
  RAISED_ICON_SHAPE_CLASS_NAME,
  raisedIconHitSlop,
  type RaisedIconFaceSize,
} from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback } from 'react';
import { Text, type Insets } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const compactFaceStyle = {
  ...continuousCorners,
  minHeight: RAISED_COMPACT_FACE_MIN_HEIGHT,
} as const;
const fitFaceStyle = {
  ...continuousCorners,
  minHeight: RAISED_FACE_MIN_HEIGHT,
} as const;
const iconFaceStyles = {
  regular: {
    ...continuousCorners,
    width: RAISED_ICON_FACE_SIZES.regular,
    height: RAISED_ICON_FACE_SIZES.regular,
  },
  small: {
    ...continuousCorners,
    width: RAISED_ICON_FACE_SIZES.small,
    height: RAISED_ICON_FACE_SIZES.small,
  },
} as const;
const iconSizes = { regular: tokens.fontSize.lg, small: tokens.fontSize.md } as const;
const evenIconHitSlops = {
  regular: raisedIconHitSlop('regular'),
  small: raisedIconHitSlop('small'),
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
  isLabelHidden = false,
  iconFace = 'regular',
  hitSlop,
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
  /**
   * The icon alone on a small square face (RAPP-884), with `label` read by the
   * screen reader and a touch that reaches past the face to a full tap target.
   * Only where the owner chose it: the forum thread's report, reply and close
   * buttons.
   */
  readonly isLabelHidden?: boolean;
  /** The size of that face; `small` is one size down, for the report flag. */
  readonly iconFace?: RaisedIconFaceSize;
  /**
   * Where that face's touch reaches, from `raisedIconHitSlop`, hoisted; by
   * default evenly round it to a full tap target.
   */
  readonly hitSlop?: Insets;
  /** While its action runs, or until it may run, a press does nothing and the button dims. */
  readonly isDisabled?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  const styles = toneStyles[tone];
  const handlePress = useCallback(() => {
    if (!isDisabled) onPress();
  }, [isDisabled, onPress]);
  const isWordSized = size !== 'full';
  const isIconOnly = isLabelHidden && icon !== undefined;
  return (
    <SelectionChoiceSurface
      label={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      onPress={handlePress}
      testID={testID}
      className={`${isWordSized && !isIconOnly ? 'self-end' : ''} ${isDisabled ? 'opacity-50' : ''}`}
      paddingClassName={isIconOnly ? 'px-0' : isWordSized ? 'px-md' : undefined}
      rowStyle={
        isIconOnly
          ? iconFaceStyles[iconFace]
          : size === 'full'
            ? undefined
            : wordSizedFaceStyles[size]
      }
      contentClassName="flex-row items-center justify-center gap-sm"
      tone={styles.wash}
      shapeClassName={isIconOnly ? RAISED_ICON_SHAPE_CLASS_NAME : undefined}
      hitSlop={isIconOnly ? (hitSlop ?? evenIconHitSlops[iconFace]) : undefined}
    >
      {icon === undefined ? null : (
        <Icon
          name={icon}
          weight="boldDuotone"
          size={
            isIconOnly
              ? iconSizes[iconFace]
              : isWordSized
                ? tokens.fontSize.xl
                : tokens.fontSize['2xl']
          }
          color={styles.icon}
        />
      )}
      {isIconOnly ? null : (
        <Text
          className={`text-center ${isWordSized ? 'text-md font-bold' : 'text-form font-medium'} ${styles.text} ${fontClass}`}
        >
          {label}
        </Text>
      )}
    </SelectionChoiceSurface>
  );
}

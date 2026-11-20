/**
 * The one word label of the mobile app (RAPP-831): a sign-up state, "Nou",
 * a category, a status. Its shape (corners, padding, text size) is set here
 * and nowhere else, so a change reaches every badge at once. The corners are
 * square like the cards; a pill is kept for things she can press, such as
 * filters. A number, such as an unread count, is a different thing: it goes
 * in the circle of `CountBubble`.
 */
import { Text, View } from 'react-native';

const SHAPE_CLASS = 'rounded-sm px-sm py-xs';
const TEXT_CLASS = 'text-sm font-semibold';

const toneClasses = {
  /** New to her: the brand's dark tone. */
  brand: { box: 'bg-primary-dark', text: 'text-white' },
  /** A soft brand tint, for a category. */
  brandSoft: { box: 'bg-primary/10', text: 'text-primary-dark' },
  /** Her own state or a highlight, in the one yellow every badge shares (RAPP-839). */
  accent: { box: 'bg-secondary', text: 'text-neutral-900' },
  neutral: { box: 'bg-neutral-100', text: 'text-neutral-800' },
  outline: { box: 'border border-neutral-300', text: 'text-neutral-800' },
  danger: { box: 'bg-error', text: 'text-white' },
  /** On top of a photo. */
  overlay: { box: 'bg-neutral-900/80', text: 'text-white' },
} as const;

export type BadgeTone = keyof typeof toneClasses;

interface BadgeProps {
  readonly label: string;
  readonly tone?: BadgeTone;
  readonly languageFontClass: string;
  /** On the word, where tests read it. */
  readonly testID?: string;
  /** Placement only, such as `self-start`; the shape is not set from outside. */
  readonly className?: string;
}

export function Badge({
  label,
  tone = 'neutral',
  languageFontClass,
  testID,
  className,
}: BadgeProps) {
  const classes = toneClasses[tone];
  return (
    <View className={`${SHAPE_CLASS} ${classes.box} ${className ?? ''}`}>
      <Text testID={testID} className={`${TEXT_CLASS} ${classes.text} ${languageFontClass}`}>
        {label}
      </Text>
    </View>
  );
}

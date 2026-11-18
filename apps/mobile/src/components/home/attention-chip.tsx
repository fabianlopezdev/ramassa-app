/**
 * The small mark on a card that still needs her (RAPP-821, RAPP-825): "Nou" on
 * an announcement or activity she has not seen and on a form or survey she has
 * not started, and the word for continue on a survey she started and did not
 * finish. A word and a colour together, so the state never depends on colour
 * alone. Its corners are square like the card it sits on, where a pill would
 * read as a filter (RAPP-826).
 */

import { Text, View } from 'react-native';

const toneClasses = {
  new: { chip: 'bg-primary-dark', text: 'text-white' },
  started: { chip: 'bg-secondary-light', text: 'text-neutral-900' },
} as const;

interface AttentionChipProps {
  /** The word to show, or null when the card needs no mark. */
  readonly label: string | null;
  readonly tone?: keyof typeof toneClasses;
  readonly languageFontClass: string;
}

export function AttentionChip({ label, tone = 'new', languageFontClass }: AttentionChipProps) {
  if (label === null) return null;
  const classes = toneClasses[tone];
  return (
    <View testID={`attention-chip-${tone}`} className={`rounded-sm px-sm py-xs ${classes.chip}`}>
      <Text className={`text-sm font-semibold ${classes.text} ${languageFontClass}`}>{label}</Text>
    </View>
  );
}

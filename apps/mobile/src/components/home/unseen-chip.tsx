/**
 * The mark on a card she has not seen yet (RAPP-821): an announcement on Inici
 * or a new activity. A word and a colour together, so the state never depends
 * on colour alone.
 */

import { Text, View } from 'react-native';

interface UnseenChipProps {
  /** The word to show, or null when she has already seen the card. */
  readonly label: string | null;
  readonly languageFontClass: string;
}

export function UnseenChip({ label, languageFontClass }: UnseenChipProps) {
  if (label === null) return null;
  return (
    <View testID="unseen-chip" className="rounded-full bg-primary-dark px-sm py-xs">
      <Text className={`text-sm font-semibold text-white ${languageFontClass}`}>{label}</Text>
    </View>
  );
}

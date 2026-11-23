/**
 * The pieces of the row at the foot of a raised card with a photo (RAPP-921),
 * on its brand panel: who wrote it, how many replies it has, a cost. The card
 * puts a thin line between them and its arrow at the end, so a card passes
 * only the pieces it has.
 */
import { Icon } from '@/components/icons/icon';
import { PersonAvatar } from '@/components/people/person-avatar';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/** The author's avatar and first name alone, never "Publicat per" (RAPP-912). */
export function RaisedCardFooterAuthor({
  name,
  avatarKey,
  showsAvatar = true,
}: {
  readonly name: string;
  /** Her photo; without one, the person icon. */
  readonly avatarKey?: string | null;
  /** Off for a guide, whose card never showed its author's face. */
  readonly showsAvatar?: boolean;
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="shrink flex-row items-center gap-sm">
      {showsAvatar ? (
        <PersonAvatar name={name} avatarKey={avatarKey ?? null} size="medium" fallback="person" />
      ) : null}
      <Text
        numberOfLines={1}
        className={`shrink text-start text-md font-bold text-white ${languageFontClass}`}
      >
        {name}
      </Text>
    </View>
  );
}

/**
 * The speech bubble and the number of replies, such as "2 respostes". A card
 * with no replies passes no piece at all (RAPP-922).
 */
export function RaisedCardFooterReplies({ label }: { readonly label: string }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="flex-row items-center gap-xs">
      <Icon name="chat" size={tokens.fontSize.xl} color={tokens.colors.white} />
      <Text className={`text-start text-md tabular-nums text-white ${languageFontClass}`}>
        {label}
      </Text>
    </View>
  );
}

/** A short fact in the row, such as a service's cost; `emphasis` sets it in bold. */
export function RaisedCardFooterText({
  text,
  emphasis = false,
}: {
  readonly text: string;
  readonly emphasis?: boolean;
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <Text
      className={`text-start text-md text-white ${emphasis ? 'font-bold' : ''} ${languageFontClass}`}
    >
      {text}
    </Text>
  );
}

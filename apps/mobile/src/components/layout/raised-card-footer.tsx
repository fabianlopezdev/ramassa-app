/**
 * The pieces of the row at the foot of a raised card with a photo (RAPP-921),
 * on its panel: who wrote it, how many replies it has, a cost. The card puts a
 * thin line between them and its arrow at the end, so a card passes only the
 * pieces it has.
 *
 * The panel is the brand colour, or the pale wash of the card's topic when the
 * card has one (RAPP-930). The pieces read the panel's ink from the card, so
 * they stay white on the brand and turn dark on a wash.
 */
import { Icon } from '@/components/icons/icon';
import type { RaisedTone } from '@/components/layout/raised-surface';
import { PersonAvatar } from '@/components/people/person-avatar';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { createContext, useContext } from 'react';
import { Text, View } from 'react-native';
import { sectionHue } from '@ramassa/shared/section-colors';
import { tokens } from '@ramassa/shared/tokens';

/**
 * The ink of a photo card's panel (RAPP-930): white on the brand colour, the
 * dark text of the plain cards on the pale wash of a topic.
 */
export type RaisedCardPanelInk = 'onBrand' | 'onWash';

/** The panel's ink for a card's tone: a tone with a colour puts the panel on its wash. */
export function raisedCardPanelInk(tone: RaisedTone | undefined): RaisedCardPanelInk {
  return tone !== undefined && sectionHue(tone) !== undefined ? 'onWash' : 'onBrand';
}

/** The text and icon colour of each ink, shared by the card and its footer pieces. */
export const RAISED_CARD_PANEL_INK = {
  onBrand: {
    textClassName: 'text-white',
    dividerClassName: 'border-white/50',
    iconColor: tokens.colors.white,
  },
  onWash: {
    textClassName: 'text-neutral-900',
    dividerClassName: 'border-neutral-300',
    iconColor: tokens.colors.neutral[900],
  },
} as const satisfies Record<
  RaisedCardPanelInk,
  { textClassName: string; dividerClassName: string; iconColor: string }
>;

/** Set by the card around its panel; a piece outside a card reads the brand ink. */
export const RaisedCardPanelInkContext = createContext<RaisedCardPanelInk>('onBrand');

function usePanelInk() {
  return RAISED_CARD_PANEL_INK[useContext(RaisedCardPanelInkContext)];
}

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
  const ink = usePanelInk();
  return (
    <View className="shrink flex-row items-center gap-sm">
      {showsAvatar ? (
        <PersonAvatar name={name} avatarKey={avatarKey ?? null} size="medium" fallback="person" />
      ) : null}
      <Text
        numberOfLines={1}
        className={`shrink text-start text-md font-bold ${ink.textClassName} ${languageFontClass}`}
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
  const ink = usePanelInk();
  return (
    <View className="flex-row items-center gap-xs">
      <Icon name="chat" size={tokens.fontSize.xl} color={ink.iconColor} />
      <Text className={`text-start text-md tabular-nums ${ink.textClassName} ${languageFontClass}`}>
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
  const ink = usePanelInk();
  return (
    <Text
      className={`text-start text-md ${ink.textClassName} ${emphasis ? 'font-bold' : ''} ${languageFontClass}`}
    >
      {text}
    </Text>
  );
}

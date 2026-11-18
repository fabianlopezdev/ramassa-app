/**
 * The raised card of the player app (RAPP-826): the surface Onboarding uses
 * for its choices, as a card that opens something. A border and a solid edge
 * below it say "this presses", and the face sinks onto the edge on touch.
 * Cards on Inici (a pending form or survey, the next activity, an
 * announcement) share it, so they all look and press the same.
 *
 * A card may start with a block and a divider (RAPP-830): the date of an
 * activity, the icon of a Per fer item. The block has one width, so the
 * dividers line up from card to card.
 *
 * A card may carry one badge (RAPP-840): "Nou", the word for continue, her
 * sign-up state. It sits on the card's top edge near the start, half above
 * the border and half inside, so it reads as a label on the card and leaves
 * the content to the name. A count, such as unread messages, sits on the same
 * edge near the end, in a circle (RAPP-842).
 */
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { FORWARD_CHEVRON } from '@/components/icons/direction';
import { Icon, type IconName } from '@/components/icons/icon';
import { Badge, type BadgeTone } from '@/components/layout/badge';
import { CountBubble } from '@/components/layout/count-bubble';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const leadingBlockStyle = { minWidth: tokens.spacing['2xl'] } as const;

/**
 * An icon for the block at the start of a card: as wide as the block, in the
 * organization's brand colour like the card's border, with nothing behind it
 * (RAPP-832).
 */
export function RaisedCardSymbol({ name }: { readonly name: IconName }) {
  const brandColor = useBrandColor();
  return <Icon name={name} weight="boldDuotone" size={tokens.spacing['2xl']} color={brandColor} />;
}

interface RaisedCardProps {
  readonly testID?: string;
  readonly accessibilityLabel: string;
  readonly onOpen: () => void;
  /** The block at the start, before a divider: a date or an icon. */
  readonly leading?: ReactNode;
  /** The forward arrow at the end. Off for a card whose content already fills the row. */
  readonly showsArrow?: boolean;
  /** The label on the card's top edge. Its word is also part of `accessibilityLabel`. */
  readonly badge?: RaisedCardBadge | null;
  /** A number in a circle on the top edge near the end. Also part of `accessibilityLabel`. */
  readonly count?: string | null;
  readonly children: ReactNode;
}

export interface RaisedCardBadge {
  readonly label: string;
  readonly tone: BadgeTone;
}

export function RaisedCard({
  testID,
  accessibilityLabel,
  onOpen,
  leading,
  showsArrow = true,
  badge = null,
  count = null,
  children,
}: RaisedCardProps) {
  const brandColor = useBrandColor();
  const languageFontClass = useLanguageFontClass();
  const card = (
    <SelectionChoiceSurface
      testID={testID}
      label={accessibilityLabel}
      accessibilityRole="link"
      onPress={onOpen}
      contentClassName="flex-row items-stretch gap-md py-md"
    >
      {leading === undefined ? null : (
        <>
          <View className="items-center justify-center" style={leadingBlockStyle}>
            {leading}
          </View>
          <View accessible={false} className="border-s-2 border-neutral-300" />
        </>
      )}
      <View className="flex-1 justify-center gap-xs">{children}</View>
      {showsArrow ? (
        <View className="justify-center">
          <Icon name={FORWARD_CHEVRON} size={tokens.fontSize['2xl']} color={brandColor} />
        </View>
      ) : null}
    </SelectionChoiceSurface>
  );
  if (badge === null && count === null) return card;
  // The badge and the count are drawn over the card from outside it, because
  // the card's face clips what it holds. The room above keeps them clear of
  // what comes before.
  return (
    <View className="relative pt-sm">
      {card}
      {badge === null ? null : (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute start-lg top-sm -translate-y-1/2"
        >
          <Badge label={badge.label} tone={badge.tone} languageFontClass={languageFontClass} />
        </View>
      )}
      {count === null ? null : (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute end-lg top-sm -translate-y-1/2"
        >
          <CountBubble label={count} />
        </View>
      )}
    </View>
  );
}

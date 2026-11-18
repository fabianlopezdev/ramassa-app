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
 * edge near the end, in a circle (RAPP-842). Both come from `EdgeMarks`,
 * which the filter chips share (RAPP-848).
 *
 * A card may take the colour of its kind on its face (RAPP-845), as a pale
 * wash; its border, edge and arrow stay in the brand.
 *
 * A card may open with a photo (RAPP-852), such as a forum post's or a
 * story's: full width across the top of the face, clipped by its corners,
 * with the row under it.
 *
 * A card may be a tile in a grid (RAPP-854), such as an Ajuda category: the
 * same face, block and divider with tighter padding and gaps, no arrow, and
 * it fills its cell so the tiles in a row share a height.
 */
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { FORWARD_CHEVRON } from '@/components/icons/direction';
import { Icon, type IconName } from '@/components/icons/icon';
import { EdgeMarks, type EdgeMarkBadge } from '@/components/layout/edge-marks';
import type { RaisedTone } from '@/components/layout/raised-surface';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const leadingBlockStyle = { minWidth: tokens.spacing['2xl'] } as const;
// The face keeps its side padding for the row; the photo reaches past it.
const mediaBleedStyle = { marginHorizontal: -tokens.spacing.lg } as const;
const ROW_CLASS_NAME = 'flex-row items-stretch gap-md';
/**
 * A tile is half the width of a card, so its row keeps the spacing tight
 * (RAPP-870): a name such as "Alfabetització" fits whole at the size every
 * other tile uses.
 */
const TILE_ROW_CLASS_NAME = 'flex-1 flex-row items-stretch gap-xs';

/**
 * An icon for the block at the start of a card: as wide as the block, in the
 * organization's brand colour like the card's border, with nothing behind it
 * (RAPP-832).
 */
export function RaisedCardSymbol({
  name,
  color,
}: {
  readonly name: IconName;
  /** In place of the brand colour, such as the error red of signing out. */
  readonly color?: string;
}) {
  const brandColor = useBrandColor();
  return (
    <Icon
      name={name}
      weight="boldDuotone"
      size={tokens.spacing['2xl']}
      color={color ?? brandColor}
    />
  );
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
  /** The colour of the card's kind, as a wash on its face. */
  readonly tone?: RaisedTone;
  /** A full-width photo above the row, such as a post's image. */
  readonly media?: ReactNode;
  /** A tile in a grid: tighter, no arrow, fills its cell. */
  readonly tile?: boolean;
  readonly children: ReactNode;
}

export type RaisedCardBadge = EdgeMarkBadge;

export function RaisedCard({
  testID,
  accessibilityLabel,
  onOpen,
  leading,
  showsArrow = true,
  badge = null,
  count = null,
  tone,
  media,
  tile = false,
  children,
}: RaisedCardProps) {
  const brandColor = useBrandColor();
  const hasMedia = media !== undefined && media !== null;
  const rowContent = (
    <>
      {leading === undefined ? null : (
        <>
          <View
            className="items-center justify-center"
            style={tile ? undefined : leadingBlockStyle}
          >
            {leading}
          </View>
          <View accessible={false} className="border-s-2 border-neutral-300" />
        </>
      )}
      <View className="flex-1 justify-center gap-xs">{children}</View>
      {showsArrow && !tile ? (
        <View className="justify-center">
          <Icon name={FORWARD_CHEVRON} size={tokens.fontSize['2xl']} color={brandColor} />
        </View>
      ) : null}
    </>
  );
  const card = (
    <SelectionChoiceSurface
      testID={testID}
      label={accessibilityLabel}
      accessibilityRole="link"
      onPress={onOpen}
      contentClassName={
        hasMedia ? 'gap-md pb-md' : `${tile ? TILE_ROW_CLASS_NAME : ROW_CLASS_NAME} py-md`
      }
      className={tile ? 'flex-1' : undefined}
      paddingClassName={tile ? 'px-xs' : undefined}
      tone={tone}
    >
      {hasMedia ? (
        <>
          <View style={mediaBleedStyle}>{media}</View>
          <View className={ROW_CLASS_NAME}>{rowContent}</View>
        </>
      ) : (
        rowContent
      )}
    </SelectionChoiceSurface>
  );
  if (badge === null && count === null) return card;
  return (
    <EdgeMarks badge={badge} count={count}>
      {card}
    </EdgeMarks>
  );
}

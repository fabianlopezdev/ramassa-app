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
 * story's. Such a card takes the photo layout (RAPP-921): the photo edge to
 * edge across the top in one landscape shape, fading into a panel in the
 * brand colour. Its badge and title sit in white on the lower part of the
 * photo, its other content in white on the panel, and a row at its foot holds
 * the pieces it has (an author, the replies) with a thin line between them and
 * the arrow at the end. The block at the start and the tone are left out.
 *
 * A card may be a tile in a grid (RAPP-854), such as an Ajuda category: the
 * same face, block and divider with tighter padding and gaps, no arrow, and
 * it fills its cell so the tiles in a row share a height. A tile may stack
 * (RAPP-879): icon on top, name under it, no divider; the other tile of
 * its row then takes the stacked tile's height. A tile with a mark on its
 * edge still fills its cell (RAPP-873): its marks grow from their own height
 * like the tile does.
 *
 * A card that opens a screen by its `href` (RAPP-916) and shows a photo grows
 * that photo into the photo at the top of the screen it opens, on iOS. A card
 * that opens anything else keeps its `onOpen`.
 */
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { FORWARD_CHEVRON } from '@/components/icons/direction';
import { Icon, type IconName } from '@/components/icons/icon';
import { Badge, type BadgeTone } from '@/components/layout/badge';
import { EdgeMarks, type EdgeMarkBadge } from '@/components/layout/edge-marks';
import { useRaisedChoiceFaceStyle, type RaisedTone } from '@/components/layout/raised-surface';
import { PhotoZoomLink } from '@/components/media/photo-zoom';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { Href } from 'expo-router';
import { Children, Fragment, useMemo, type ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const leadingBlockStyle = { minWidth: tokens.spacing['2xl'] } as const;
// The face keeps its side padding for the row; the photo reaches past it.
const mediaBleedStyle = { marginHorizontal: -tokens.spacing.lg } as const;
const ROW_CLASS_NAME = 'flex-row items-stretch gap-md';
/** A tile is half the width of a card, so its row keeps a smaller gap. */
const TILE_ROW_CLASS_NAME = 'grow flex-row items-stretch gap-sm';
/**
 * A stacked tile (RAPP-879): the icon on top and the name under it, both on
 * the start edge, with no divider. The name keeps to the bottom, so when the
 * other tile of the row is taller the name still sits at its foot.
 */
const TILE_STACK_CLASS_NAME = 'grow items-stretch gap-sm';

/**
 * How far up the photo the fade into the brand panel starts (RAPP-921). The
 * badge and the title sit inside it, so they always have the fade under them.
 */
const PHOTO_FADE_HEIGHT = tokens.spacing['2xl'] + tokens.spacing['3xl'];
const PHOTO_TITLE_LINES = 2;

/**
 * The fade from the photo into the panel, in the brand colour with two hex
 * digits of opacity: clear at the top, mostly brand behind the badge, solid
 * under the title, so white text reads on any photo.
 */
function photoFadeStyle(brandColor: string): ViewStyle {
  return {
    marginTop: -PHOTO_FADE_HEIGHT,
    minHeight: PHOTO_FADE_HEIGHT,
    paddingTop: tokens.spacing.xl,
    backgroundImage: `linear-gradient(to bottom, ${brandColor}00, ${brandColor}B3 45%, ${brandColor} 85%)`,
  };
}

/** The dark "Nou" would sink into the brand fade, so on the photo it turns white. */
function badgeToneOnPhoto(tone: BadgeTone): BadgeTone {
  return tone === 'brand' ? 'inverse' : tone;
}

/**
 * An icon for the block at the start of a card: as wide as the block, in the
 * organization's brand colour like the card's border, with nothing behind it
 * (RAPP-832).
 */
export function RaisedCardSymbol({
  name,
  color,
  size = tokens.spacing['2xl'],
}: {
  readonly name: IconName;
  /** In place of the brand colour, such as the error red of signing out. */
  readonly color?: string;
  /** Larger on a half-width card (RAPP-874), where the icon sits above the name. */
  readonly size?: number;
}) {
  const brandColor = useBrandColor();
  return <Icon name={name} weight="boldDuotone" size={size} color={color ?? brandColor} />;
}

/** What the card opens: a screen by its `href`, or anything else through `onOpen`. */
type RaisedCardOpening =
  | { readonly onOpen: () => void; readonly href?: undefined }
  | {
      /**
       * The screen the card opens (RAPP-916). With a photo in `media`, the
       * photo grows into the photo at the top of that screen on iOS.
       */
      readonly href: Href;
      readonly onOpen?: undefined;
    };

type RaisedCardProps = RaisedCardOpening & {
  readonly testID?: string;
  readonly accessibilityLabel: string;
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
  /**
   * The card's photo from `RaisedCardPhoto`, such as a post's image. With it
   * the card takes the photo layout (RAPP-921): `children` go on the brand
   * panel in white, and `leading` and `tone` are left out.
   */
  readonly media?: ReactNode;
  /** With a photo: the title, in white on the lower part of the photo. */
  readonly mediaTitle?: string | null;
  /**
   * With a photo: the pieces of the row at the panel's foot, from
   * `raised-card-footer`, before the arrow. A missing piece is null.
   */
  readonly footer?: readonly ReactNode[];
  /** A tile in a grid: tighter, no arrow, fills its cell. */
  readonly tile?: boolean;
  /**
   * A tile with its icon on top and its name under it, for a name with a word
   * too long to fit beside the icon (RAPP-879).
   */
  readonly stacked?: boolean;
  /**
   * The row that is open beside the list, on a screen wide enough to show
   * both: its face fills like a chosen choice.
   */
  readonly isSelected?: boolean;
  /** Read after the label, such as how many messages are unread. */
  readonly accessibilityHint?: string;
  readonly children?: ReactNode;
};

export type RaisedCardBadge = EdgeMarkBadge;

export function RaisedCard(props: RaisedCardProps) {
  const {
    testID,
    accessibilityLabel,
    leading,
    showsArrow = true,
    badge = null,
    count = null,
    tone,
    media,
    mediaTitle = null,
    footer,
    tile = false,
    stacked = false,
    isSelected,
    accessibilityHint,
    children,
  } = props;
  const brandColor = useBrandColor();
  const languageFontClass = useLanguageFontClass();
  const defaultFaceStyle = useRaisedChoiceFaceStyle();
  const hasMedia = media !== undefined && media !== null;
  // The whole face takes the brand colour, so the fade below a tall title
  // still meets the panel.
  const brandFaceStyle = useMemo<ViewStyle>(
    () => ({ ...defaultFaceStyle, backgroundColor: brandColor }),
    [brandColor, defaultFaceStyle],
  );
  const fadeStyle = useMemo(() => photoFadeStyle(brandColor), [brandColor]);
  const isStackedTile = tile && stacked && !hasMedia;
  const stackedContent = (
    <>
      {leading === undefined ? null : <View className="items-start">{leading}</View>}
      <View className="grow justify-end gap-xs">{children}</View>
    </>
  );
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
  const footerPieces = (footer ?? []).filter(
    (piece) => piece !== null && piece !== undefined && piece !== false,
  );
  const photoContent = hasMedia ? (
    <>
      <View style={mediaBleedStyle}>
        {media}
        <View pointerEvents="none" style={fadeStyle} className="justify-end gap-sm px-lg pb-xs">
          {badge === null ? null : (
            <Badge
              label={badge.label}
              tone={badgeToneOnPhoto(badge.tone)}
              languageFontClass={languageFontClass}
              className="self-start"
            />
          )}
          {mediaTitle === null || mediaTitle.length === 0 ? null : (
            <Text
              numberOfLines={PHOTO_TITLE_LINES}
              className={`text-start text-2xl font-bold text-white ${languageFontClass}`}
            >
              {mediaTitle}
            </Text>
          )}
        </View>
      </View>
      {Children.toArray(children).length === 0 ? null : <View className="gap-sm">{children}</View>}
      <View className="flex-row items-center gap-md">
        <View className="flex-1 flex-row flex-wrap items-center gap-x-md gap-y-xs">
          {footerPieces.map((piece, index) => (
            <Fragment key={index}>
              {index === 0 ? null : (
                <View accessible={false} className="self-stretch border-s border-white/50" />
              )}
              {piece}
            </Fragment>
          ))}
        </View>
        {showsArrow ? (
          <Icon name={FORWARD_CHEVRON} size={tokens.fontSize['2xl']} color={tokens.colors.white} />
        ) : null}
      </View>
    </>
  ) : null;
  const renderSurface = (open: () => void) => (
    <SelectionChoiceSurface
      testID={testID}
      label={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole="link"
      isSelected={isSelected}
      onPress={open}
      contentClassName={
        hasMedia
          ? 'gap-md pb-md'
          : `${isStackedTile ? TILE_STACK_CLASS_NAME : tile ? TILE_ROW_CLASS_NAME : ROW_CLASS_NAME} py-md`
      }
      rowStyle={hasMedia ? brandFaceStyle : undefined}
      className={tile ? 'grow' : undefined}
      paddingClassName={tile ? 'px-md' : undefined}
      tone={hasMedia ? undefined : tone}
    >
      {isStackedTile ? stackedContent : hasMedia ? photoContent : rowContent}
    </SelectionChoiceSurface>
  );
  const card =
    props.href === undefined ? (
      renderSurface(props.onOpen)
    ) : (
      <PhotoZoomLink href={props.href} hasPhoto={hasMedia}>
        {renderSurface}
      </PhotoZoomLink>
    );
  // With a photo, the badge sits on the photo over the title.
  const edgeBadge = hasMedia ? null : badge;
  if (edgeBadge === null && count === null) return card;
  return (
    <EdgeMarks badge={edgeBadge} count={count} className={tile ? 'grow' : undefined}>
      {card}
    </EdgeMarks>
  );
}

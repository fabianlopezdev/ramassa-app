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
 */
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { Icon, type IconName } from '@/components/icons/icon';
import type { ReactNode } from 'react';
import { I18nManager, View } from 'react-native';
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
  readonly children: ReactNode;
}

export function RaisedCard({
  testID,
  accessibilityLabel,
  onOpen,
  leading,
  showsArrow = true,
  children,
}: RaisedCardProps) {
  const brandColor = useBrandColor();
  return (
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
          <Icon
            name={I18nManager.isRTL ? 'chevron-left' : 'chevron-right'}
            size={tokens.fontSize['2xl']}
            color={brandColor}
          />
        </View>
      ) : null}
    </SelectionChoiceSurface>
  );
}

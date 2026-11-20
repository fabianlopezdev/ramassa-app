/**
 * The half-width raised card (RAPP-874): the face, border, edge and press of
 * every other raised card (`SelectionChoiceSurface`, RAPP-826), with a big
 * icon on top, the name under it and an optional line under the name. A
 * change to the raised surface reaches it with the rest.
 *
 * Half cards go two to a row in `RaisedHalfCardRow`, and the two cards of a
 * row share one height: the taller one sets it. The face grows from its own
 * height (`grow`), so a squeezed page never folds it flat. The icon keeps to the top and
 * the name to the bottom, so the names of a pair start on one line at the
 * bottom and a name that wraps grows upward.
 *
 * The badge and the count sit on the top edge like on every other card
 * (`EdgeMarks`). The room above them is kept even when a card has neither, so
 * the two cards of a row start at the same line.
 *
 * Contacte uses it for Mentoria and Suggeriments, El meu perfil for its first
 * two rows.
 */
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import type { IconName } from '@/components/icons/icon';
import { EdgeMarks } from '@/components/layout/edge-marks';
import { RaisedCardSymbol, type RaisedCardBadge } from '@/components/layout/raised-card';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/** Bigger than the icon at the start of a full-width card, since it has the card's top to itself. */
const HALF_CARD_ICON_SIZE = tokens.spacing['3xl'];

interface RaisedHalfCardProps {
  readonly testID?: string;
  readonly icon: IconName;
  readonly title: string;
  /** A line under the name. */
  readonly detail?: string;
  readonly accessibilityLabel: string;
  /** The label on the card's top edge. Its word is also part of `accessibilityLabel`. */
  readonly badge?: RaisedCardBadge | null;
  /** A number in a circle on the top edge near the end. Also part of `accessibilityLabel`. */
  readonly count?: string | null;
  readonly languageFontClass: string;
  readonly onOpen: () => void;
}

export function RaisedHalfCard({
  testID,
  icon,
  title,
  detail,
  accessibilityLabel,
  badge = null,
  count = null,
  languageFontClass,
  onOpen,
}: RaisedHalfCardProps) {
  return (
    <EdgeMarks badge={badge} count={count} className="flex-1">
      <SelectionChoiceSurface
        testID={testID}
        label={accessibilityLabel}
        accessibilityRole="link"
        onPress={onOpen}
        className="grow"
        contentClassName="grow items-start justify-between gap-sm py-md"
      >
        <RaisedCardSymbol name={icon} size={HALF_CARD_ICON_SIZE} />
        <View className="gap-xs">
          <Text className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}>
            {title}
          </Text>
          {detail === undefined ? null : (
            <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
              {detail}
            </Text>
          )}
        </View>
      </SelectionChoiceSurface>
    </EdgeMarks>
  );
}

/** Two half cards side by side, with the gap the cards of a page keep. */
export function RaisedHalfCardRow({ children }: { readonly children: ReactNode }) {
  return <View className="flex-row gap-md">{children}</View>;
}

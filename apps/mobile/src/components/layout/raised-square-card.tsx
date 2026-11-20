/**
 * The square raised card (RAPP-874): the face, border, edge and press of every
 * other raised card (`SelectionChoiceSurface`, RAPP-826), shaped as a square
 * with the big icon on top, the name under it and an optional line under the
 * name. The icon keeps to the top and the name to the bottom, so the icons and
 * the names of a pair line up even when one name takes two lines. A change to
 * the raised surface reaches it with the rest.
 *
 * Square cards go two to a row in `RaisedSquareCardRow`. Each fills half the
 * row and is at least as tall as it is wide; with larger text it grows, and
 * the other card in the row grows with it, so the pair keeps one height.
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
import { useRaisedChoiceFaceStyle } from '@/components/layout/raised-surface';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const { shadowInlineOffset } = tokens.languageChoice;

interface RaisedSquareCardProps {
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

export function RaisedSquareCard({
  testID,
  icon,
  title,
  detail,
  accessibilityLabel,
  badge = null,
  count = null,
  languageFontClass,
  onOpen,
}: RaisedSquareCardProps) {
  // The face is as tall as it is wide: its width is the cell's, less the edge.
  const choiceFaceStyle = useRaisedChoiceFaceStyle();
  const [faceWidth, setFaceWidth] = useState(0);
  const handleLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    setFaceWidth(Math.max(0, nativeEvent.layout.width - shadowInlineOffset));
  }, []);
  const faceStyle = useMemo(
    () => ({
      ...choiceFaceStyle,
      minHeight: Math.max(choiceFaceStyle.minHeight, faceWidth),
    }),
    [choiceFaceStyle, faceWidth],
  );
  return (
    <View className="flex-1" onLayout={handleLayout}>
      <EdgeMarks badge={badge} count={count} className="flex-1">
        <SelectionChoiceSurface
          testID={testID}
          label={accessibilityLabel}
          accessibilityRole="link"
          onPress={onOpen}
          className="flex-1"
          contentClassName="flex-1 items-start justify-between gap-sm py-md"
          rowStyle={faceStyle}
        >
          <RaisedCardSymbol name={icon} />
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
    </View>
  );
}

/** Two square cards side by side, with the gap the cards of a page keep. */
export function RaisedSquareCardRow({ children }: { readonly children: ReactNode }) {
  return <View className="flex-row gap-md">{children}</View>;
}

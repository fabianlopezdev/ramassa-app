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
 * A name in a half card must never break inside a word, such as "Suggerimen /
 * ts" (RAPP-882). The row draws its pair at one of three levels:
 * 1. Both names at `text-xl`, as every pair starts.
 * 2. When either name breaks inside a word, both names step down together to
 *    `text-lg`, the base reading size. One card alone never changes.
 * 3. When either name still breaks inside a word there, the pair goes one card
 *    per row at full width, each drawn as the normal full-width card
 *    (`RaisedIconCard`) with its name back at `text-xl`.
 * A name that wraps between whole words is fine and changes nothing. The level
 * is measured again when either name, the row's width or the system text size
 * changes, and under one of those it only goes down (`half-card-name-level`).
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
import { RaisedIconCard } from '@/components/layout/raised-icon-card';
import { breaksInsideAWord } from '@/lib/breaks-inside-a-word';
import {
  firstHalfCardNameFit,
  halfCardNameLevel,
  nameBrokeInsideAWord,
  type HalfCardNameLevel,
} from '@/lib/half-card-name-level';
import {
  Children,
  createContext,
  isValidElement,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/** Bigger than the icon at the start of a full-width card, since it has the card's top to itself. */
const HALF_CARD_ICON_SIZE = tokens.spacing['3xl'];

/** Whole class names, so NativeWind sees both sizes. */
const HALF_CARD_NAME_SIZE: Record<Exclude<HalfCardNameLevel, 'rows'>, string> = {
  full: 'text-xl',
  smaller: 'text-lg',
};

interface HalfCardPair {
  readonly nameLevel: HalfCardNameLevel;
  /**
   * Changes whenever the names must be measured again. The names are keyed by
   * it, so a name is laid out afresh at each level and a late layout from the
   * level before can never be read as one at the new level.
   */
  readonly nameLayoutKey: string;
  /** Undefined until the row knows its width: a name is measured once there is a width to fit. */
  readonly reportBreakInsideAWord: ((measuredLevel: HalfCardNameLevel) => void) | undefined;
}

/** What a row tells its two cards. A half card outside a row has none and keeps the full size. */
const HalfCardPairContext = createContext<HalfCardPair | null>(null);

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
  const pair = use(HalfCardPairContext);
  const nameLevel = pair?.nameLevel ?? 'full';
  const reportBreakInsideAWord = pair?.reportBreakInsideAWord;
  const handleNameLayout = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (breaksInsideAWord(nativeEvent.lines)) reportBreakInsideAWord?.(nameLevel);
    },
    [reportBreakInsideAWord, nameLevel],
  );
  if (nameLevel === 'rows') {
    return (
      <RaisedIconCard
        testID={testID}
        icon={icon}
        title={title}
        detail={detail}
        accessibilityLabel={accessibilityLabel}
        badge={badge}
        count={count}
        languageFontClass={languageFontClass}
        onOpen={onOpen}
      />
    );
  }
  return (
    <EdgeMarks badge={badge} count={count} className="flex-1" inset="md">
      <SelectionChoiceSurface
        testID={testID}
        label={accessibilityLabel}
        accessibilityRole="link"
        onPress={onOpen}
        className="grow"
        // One step less room at the sides than a full-width card, so a name
        // such as "Suggeriments" fits a half card at the smaller size (RAPP-882).
        paddingClassName="px-md"
        contentClassName="grow items-start justify-between gap-sm py-md"
      >
        <RaisedCardSymbol name={icon} size={HALF_CARD_ICON_SIZE} />
        <View className="gap-xs">
          <Text
            key={pair?.nameLayoutKey}
            onTextLayout={reportBreakInsideAWord === undefined ? undefined : handleNameLayout}
            className={`text-start ${HALF_CARD_NAME_SIZE[nameLevel]} font-bold text-neutral-900 ${languageFontClass}`}
          >
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

/** The names of the row's cards, read from their `title`, so a new name measures the pair again. */
function pairNames(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<{ readonly title?: unknown }>(child) && typeof child.props.title === 'string'
        ? child.props.title
        : '',
    )
    .join('\n');
}

/**
 * Two half cards side by side, with the gap the cards of a page keep. When a
 * name does not fit even at the smaller size, the two cards go one per row at
 * full width, apart by the gap between the cards of a page (RAPP-882).
 */
export function RaisedHalfCardRow({ children }: { readonly children: ReactNode }) {
  const { fontScale } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const fitKey = `${pairNames(children)}|${rowWidth ?? 'unmeasured'}|${fontScale}`;
  const [fit, setFit] = useState(() => firstHalfCardNameFit(fitKey));
  const nameLevel = halfCardNameLevel(fit, fitKey);
  const reportBreak = useCallback(
    (measuredLevel: HalfCardNameLevel) =>
      setFit((current) => nameBrokeInsideAWord(current, fitKey, measuredLevel)),
    [fitKey],
  );
  const handleRowLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    setRowWidth(Math.round(nativeEvent.layout.width));
  }, []);
  const pair = useMemo<HalfCardPair>(
    () => ({
      nameLevel,
      nameLayoutKey: `${fitKey}|${nameLevel}`,
      reportBreakInsideAWord: rowWidth === null ? undefined : reportBreak,
    }),
    [fitKey, nameLevel, reportBreak, rowWidth],
  );
  return (
    <HalfCardPairContext value={pair}>
      <View
        onLayout={handleRowLayout}
        className={nameLevel === 'rows' ? 'gap-lg' : 'flex-row gap-md'}
      >
        {children}
      </View>
    </HalfCardPairContext>
  );
}

/**
 * A raised card that opens a place or a task (RAPP-842): a big icon in the
 * block at the start, the divider, a name, an optional line under it and the
 * arrow. The Per fer rows, the rows of the Xat tab and the Ajuda service
 * categories share it, so a row that opens something looks and presses the
 * same everywhere. With `iconWash` the icon sits in a circle of that colour,
 * such as an Ajuda category's own (RAPP-856). El meu perfil uses it for its
 * menu (RAPP-863); its sign-out row is `tone="danger"`: red icon and name on
 * the pale red face the delete buttons have, and no arrow, since it opens no
 * screen. Reporting an incident in Contacte is red too, and opens a screen, so
 * it keeps the arrow (RAPP-973).
 */
import type { IconName } from '@/components/icons/icon';
import { IconDisc } from '@/components/icons/icon-disc';
import {
  RaisedCard,
  RaisedCardSymbol,
  type RaisedCardBadge,
} from '@/components/layout/raised-card';
import { breaksInsideAWord } from '@/lib/breaks-inside-a-word';
import { useCallback, useState } from 'react';
import { Text, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

interface RaisedIconCardProps {
  readonly testID?: string;
  readonly icon: IconName;
  /** A pale colour for a circle behind the icon. Without it the icon stands alone. */
  readonly iconWash?: string;
  readonly title: string;
  /** A line under the name, such as the date a form is due. */
  readonly detail?: string;
  readonly accessibilityLabel: string;
  readonly badge?: RaisedCardBadge | null;
  /** A number in a circle on the top edge near the end, such as unread messages. */
  readonly count?: string | null;
  readonly languageFontClass: string;
  /**
   * A tile in a grid, such as an Ajuda category: tighter, no arrow, smaller
   * name. A name with a word too long to fit beside the icon stacks the tile.
   */
  readonly tile?: boolean;
  /** An action that ends something, such as signing out. */
  readonly tone?: 'default' | 'danger';
  /** The arrow at the end; a red card has none unless it opens a screen. */
  readonly showsArrow?: boolean;
  readonly onOpen: () => void;
}

export function RaisedIconCard({
  testID,
  icon,
  iconWash,
  title,
  detail,
  accessibilityLabel,
  badge = null,
  count = null,
  languageFontClass,
  tile = false,
  tone = 'default',
  showsArrow,
  onOpen,
}: RaisedIconCardProps) {
  const isDanger = tone === 'danger';
  // A tile lays its name out beside the icon first. If a word of the name
  // breaks across lines there, the tile stacks: icon on top, name under it
  // (RAPP-879). It is kept per name, so a new language measures again.
  const [stackedTitle, setStackedTitle] = useState<string | null>(null);
  const stacked = tile && stackedTitle === title;
  const handleTitleLayout = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (breaksInsideAWord(nativeEvent.lines)) setStackedTitle(title);
    },
    [title],
  );
  return (
    <RaisedCard
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onOpen={onOpen}
      leading={
        iconWash === undefined ? (
          <RaisedCardSymbol name={icon} color={isDanger ? tokens.colors.error : undefined} />
        ) : (
          <IconDisc name={icon} wash={iconWash} size={tile ? tokens.fontSize.xl : undefined} />
        )
      }
      badge={badge}
      count={count}
      tile={tile}
      stacked={stacked}
      showsArrow={showsArrow ?? !isDanger}
      tone={isDanger ? 'error' : undefined}
    >
      <Text
        onTextLayout={tile && !stacked ? handleTitleLayout : undefined}
        className={`text-start ${tile ? 'text-md' : 'text-xl'} font-bold ${isDanger ? 'text-error' : 'text-neutral-900'} ${languageFontClass}`}
      >
        {title}
      </Text>
      {detail === undefined ? null : (
        <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>{detail}</Text>
      )}
    </RaisedCard>
  );
}

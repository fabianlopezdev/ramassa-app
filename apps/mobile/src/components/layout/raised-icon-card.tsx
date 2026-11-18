/**
 * A raised card that opens a place or a task (RAPP-842): a big icon in the
 * block at the start, the divider, a name, an optional line under it and the
 * arrow. The Per fer rows, the rows of the Xat tab and the Ajuda service
 * categories share it, so a row that opens something looks and presses the
 * same everywhere. With `iconWash` the icon sits in a circle of that colour,
 * such as an Ajuda category's own (RAPP-856).
 */
import type { IconName } from '@/components/icons/icon';
import { IconDisc } from '@/components/icons/icon-disc';
import {
  RaisedCard,
  RaisedCardSymbol,
  type RaisedCardBadge,
} from '@/components/layout/raised-card';
import { Text } from 'react-native';
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
  /** A tile in a grid, such as an Ajuda category: tighter, no arrow, smaller name. */
  readonly tile?: boolean;
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
  onOpen,
}: RaisedIconCardProps) {
  return (
    <RaisedCard
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onOpen={onOpen}
      leading={
        iconWash === undefined ? (
          <RaisedCardSymbol name={icon} />
        ) : (
          <IconDisc name={icon} wash={iconWash} size={tile ? tokens.fontSize.xl : undefined} />
        )
      }
      badge={badge}
      count={count}
      tile={tile}
    >
      <Text
        className={`text-start ${tile ? 'text-md' : 'text-xl'} font-bold text-neutral-900 ${languageFontClass}`}
      >
        {title}
      </Text>
      {detail === undefined ? null : (
        <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>{detail}</Text>
      )}
    </RaisedCard>
  );
}

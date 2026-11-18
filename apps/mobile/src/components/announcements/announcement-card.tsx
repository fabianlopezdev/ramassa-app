import { RaisedCard, type RaisedCardBadge } from '@/components/layout/raised-card';
import { memo, useCallback, useMemo } from 'react';
import { Text } from 'react-native';

export interface AnnouncementCardProps {
  readonly id: string;
  readonly title: string;
  readonly accessibilityLabel: string;
  /** Set while she has not seen the announcement (RAPP-821): the word shown on its mark. */
  readonly unseenLabel?: string | null;
  readonly languageFontClass: string;
  readonly onOpen: (id: string) => void;
}

/**
 * An announcement on Inici as a raised row (RAPP-829): its title and an arrow,
 * plus the mark while she has not seen it. Its text, date, photo and category
 * are on the announcement's own screen.
 */
export const AnnouncementCard = memo(function AnnouncementCard({
  id,
  title,
  accessibilityLabel,
  unseenLabel = null,
  languageFontClass,
  onOpen,
}: AnnouncementCardProps) {
  const handleOpen = useCallback(() => onOpen(id), [id, onOpen]);
  const badge = useMemo<RaisedCardBadge | null>(
    () => (unseenLabel === null ? null : { label: unseenLabel, tone: 'brand' }),
    [unseenLabel],
  );
  return (
    <RaisedCard accessibilityLabel={accessibilityLabel} onOpen={handleOpen} badge={badge}>
      <Text
        className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
        numberOfLines={2}
      >
        {title}
      </Text>
    </RaisedCard>
  );
});

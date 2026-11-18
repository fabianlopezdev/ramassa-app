import { AttentionChip } from '@/components/home/attention-chip';
import { RaisedCard } from '@/components/layout/raised-card';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';

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
  return (
    <RaisedCard accessibilityLabel={accessibilityLabel} onOpen={handleOpen}>
      {unseenLabel === null ? null : (
        <View className="flex-row">
          <AttentionChip label={unseenLabel} languageFontClass={languageFontClass} />
        </View>
      )}
      <Text
        className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
        numberOfLines={2}
      >
        {title}
      </Text>
    </RaisedCard>
  );
});

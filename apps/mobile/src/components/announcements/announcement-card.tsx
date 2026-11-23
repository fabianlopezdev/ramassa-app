import { announcementCategoryTone } from '@/components/announcements/category-filters';
import { RaisedCard, type RaisedCardBadge } from '@/components/layout/raised-card';
import { RaisedCardPhoto, useRaisedCardPhotoSource } from '@/components/layout/raised-card-photo';
import { memo, useCallback, useMemo } from 'react';
import { Text } from 'react-native';
import type { AnnouncementCategory } from '@ramassa/shared/announcements';
import { useAuth } from '@ramassa/shared/auth';

export interface AnnouncementCardProps {
  readonly id: string;
  readonly title: string;
  /** Its kind, which colours the card (RAPP-845). */
  readonly category: AnnouncementCategory;
  readonly accessibilityLabel: string;
  /** The stored key of its photo (RAPP-911), shown across the top of the card. */
  readonly imageObjectKey: string | null;
  /** The photo's alt text in her language, as the announcement's own screen reads it. */
  readonly imageAlt?: string;
  /** Set while she has not seen the announcement (RAPP-821): the word shown on its mark. */
  readonly unseenLabel?: string | null;
  readonly languageFontClass: string;
  readonly onOpen: (id: string) => void;
}

/**
 * An announcement on Inici as a raised row (RAPP-829): its title and an arrow,
 * plus the mark while she has not seen it, in the colour of its kind
 * (RAPP-845). An announcement with a photo shows it across the top of the
 * card, like a forum post (RAPP-911). Its text and date are on the
 * announcement's own screen.
 */
export const AnnouncementCard = memo(function AnnouncementCard({
  id,
  title,
  category,
  accessibilityLabel,
  imageObjectKey,
  imageAlt,
  unseenLabel = null,
  languageFontClass,
  onOpen,
}: AnnouncementCardProps) {
  const { session } = useAuth();
  const imageSource = useRaisedCardPhotoSource(imageObjectKey, session?.access_token);
  const handleOpen = useCallback(() => onOpen(id), [id, onOpen]);
  const badge = useMemo<RaisedCardBadge | null>(
    () => (unseenLabel === null ? null : { label: unseenLabel, tone: 'brand' }),
    [unseenLabel],
  );
  return (
    <RaisedCard
      accessibilityLabel={accessibilityLabel}
      onOpen={handleOpen}
      badge={badge}
      tone={announcementCategoryTone(category)}
      media={
        imageSource === null ? null : (
          <RaisedCardPhoto
            source={imageSource}
            accessibilityLabel={imageAlt}
            recyclingKey={imageObjectKey ?? id}
          />
        )
      }
    >
      <Text
        className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
        numberOfLines={2}
      >
        {title}
      </Text>
    </RaisedCard>
  );
});

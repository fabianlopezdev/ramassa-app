import { RaisedCard, type RaisedCardBadge } from '@/components/layout/raised-card';
import { RaisedCardPhoto, useRaisedCardPhotoSource } from '@/components/layout/raised-card-photo';
import type { Href } from 'expo-router';
import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';

export interface ServiceCardProps {
  readonly id: string;
  readonly title: string;
  readonly provider: string | null;
  readonly location: string | null;
  readonly cost: string;
  readonly availability: string;
  readonly interested: boolean;
  readonly interestedLabel: string;
  readonly imageObjectKey: string | null;
  readonly imageAlt: string | null;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  /** The service's own screen; its photo grows into that screen's photo (RAPP-916). */
  readonly href: Href;
  /**
   * Set while the service is new to her (RAPP-873): the word on the card's top
   * edge, where every card carries it. The caller says it in the label.
   */
  readonly unseenLabel?: string | null;
}

export const ServiceCard = memo(function ServiceCard({
  id,
  title,
  provider,
  location,
  cost,
  availability,
  interested,
  interestedLabel,
  imageObjectKey,
  imageAlt,
  accessibilityLabel,
  languageFontClass,
  href,
  unseenLabel = null,
}: ServiceCardProps) {
  const { session } = useAuth();
  const imageSource = useRaisedCardPhotoSource(imageObjectKey, session?.access_token);
  // Her saved interest sits on the card's edge, like her sign-up on an activity
  // card. While the service is new to her, "Nou" takes that place (RAPP-873).
  const badge = useMemo<RaisedCardBadge | null>(() => {
    if (unseenLabel !== null) return { label: unseenLabel, tone: 'brand' };
    return interested ? { label: interestedLabel, tone: 'accent' } : null;
  }, [interested, interestedLabel, unseenLabel]);
  return (
    <RaisedCard
      testID={`service-card-${id}`}
      accessibilityLabel={accessibilityLabel}
      href={href}
      badge={badge}
      media={
        imageSource === null ? undefined : (
          <RaisedCardPhoto
            source={imageSource}
            accessibilityLabel={imageAlt ?? title}
            recyclingKey={imageObjectKey ?? id}
          />
        )
      }
    >
      <View className="gap-sm">
        <Text
          className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
          numberOfLines={2}
        >
          {title}
        </Text>
        {provider === null ? null : (
          <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
            {provider}
          </Text>
        )}
        {location === null ? null : (
          <Text
            className={`text-start text-sm text-neutral-600 ${languageFontClass}`}
            numberOfLines={2}
          >
            {location}
          </Text>
        )}
        <View className="flex-row flex-wrap gap-sm">
          <Text
            className={`text-start text-sm font-semibold text-primary-dark ${languageFontClass}`}
          >
            {cost}
          </Text>
          <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
            {availability}
          </Text>
        </View>
      </View>
    </RaisedCard>
  );
});

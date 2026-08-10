import { PressableScale } from '@/components/motion/pressable-scale';
import { composeContinuousViewStyle } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.colors.neutral[200],
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.white,
  },
  image: { width: '100%', height: tokens.spacing['3xl'] * 3 },
});
const cardStyle = composeContinuousViewStyle(styles.card);

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
  readonly onOpen: (id: string) => void;
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
  onOpen,
}: ServiceCardProps) {
  const { session } = useAuth();
  const imageSource = resolveMediaImageSource({
    objectKeyOrUrl: imageObjectKey,
    mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
    accessToken: session?.access_token,
  });
  const handlePress = useCallback(() => onOpen(id), [id, onOpen]);
  return (
    <PressableScale
      testID={`service-card-${id}`}
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      haptic="tapLight"
      style={cardStyle}
      className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
    >
      {imageSource === null ? null : (
        <Image
          source={imageSource}
          accessibilityLabel={imageAlt ?? title}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={imageObjectKey ?? id}
          style={styles.image}
        />
      )}
      <View className="gap-sm p-md">
        {interested ? (
          <View className="self-start rounded-full bg-secondary-light px-sm py-xs">
            <Text className={`text-sm font-semibold text-neutral-900 ${languageFontClass}`}>
              {interestedLabel}
            </Text>
          </View>
        ) : null}
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
    </PressableScale>
  );
});

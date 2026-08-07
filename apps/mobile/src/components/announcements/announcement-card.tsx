import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { Image, type ImageSource } from 'expo-image';
import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const imageStyle = { width: '100%', height: tokens.contentWidth.form / 2 } as const;

export interface AnnouncementCardProps {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly category: string;
  readonly publishedDate: string;
  readonly imageObjectKeyOrUrl: string | null;
  readonly accessToken: string | undefined;
  readonly imageAlt: string | null;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly onOpen: (id: string) => void;
}

interface AnnouncementCardFrameProps extends AnnouncementCardProps {
  readonly children?: ReactNode;
}

function AnnouncementCardFrame({
  id,
  title,
  body,
  category,
  publishedDate,
  imageObjectKeyOrUrl,
  accessToken,
  imageAlt,
  accessibilityLabel,
  languageFontClass,
  onOpen,
  children,
}: AnnouncementCardFrameProps) {
  const imageSource: ImageSource | null = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: imageObjectKeyOrUrl,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, imageObjectKeyOrUrl],
  );
  const handlePress = useCallback(() => onOpen(id), [id, onOpen]);

  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      haptic="tapLight"
      style={continuousCorners}
      className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
    >
      {imageSource === null ? null : (
        <Image
          source={imageSource}
          accessible={imageAlt !== null}
          accessibilityLabel={imageAlt ?? undefined}
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={id}
          style={imageStyle}
        />
      )}
      <View className="gap-sm p-md">
        <View className="flex-row flex-wrap items-center gap-sm">
          <View className="rounded-full bg-neutral-100 px-sm py-xs">
            <Text className={`text-sm font-medium text-neutral-700 ${languageFontClass}`}>
              {category}
            </Text>
          </View>
          {children}
        </View>
        <Text
          className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text
          className={`text-start text-md text-neutral-600 ${languageFontClass}`}
          numberOfLines={3}
        >
          {body}
        </Text>
        <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
          {publishedDate}
        </Text>
      </View>
    </PressableScale>
  );
}

export const AnnouncementCard = memo(function AnnouncementCard(props: AnnouncementCardProps) {
  return <AnnouncementCardFrame {...props} />;
});

export interface PinnedAnnouncementCardProps extends AnnouncementCardProps {
  readonly pinnedLabel: string;
}

export const PinnedAnnouncementCard = memo(function PinnedAnnouncementCard({
  pinnedLabel,
  ...cardProps
}: PinnedAnnouncementCardProps) {
  return (
    <AnnouncementCardFrame {...cardProps}>
      <View className="rounded-full bg-secondary px-sm py-xs">
        <Text className={`text-sm font-semibold text-neutral-900 ${cardProps.languageFontClass}`}>
          {pinnedLabel}
        </Text>
      </View>
    </AnnouncementCardFrame>
  );
});

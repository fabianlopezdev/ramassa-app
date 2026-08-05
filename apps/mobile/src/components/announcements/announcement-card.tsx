import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: tokens.contentWidth.form / 2,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
  },
});

export interface AnnouncementCardProps {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly category: string;
  readonly publishedDate: string;
  readonly imageSource: ImageSource | null;
  readonly imageAlt: string | null;
  readonly isPinned: boolean;
  readonly pinnedLabel: string;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly onOpen: (id: string) => void;
}

export function AnnouncementCard({
  id,
  title,
  body,
  category,
  publishedDate,
  imageSource,
  imageAlt,
  isPinned,
  pinnedLabel,
  accessibilityLabel,
  languageFontClass,
  onOpen,
}: AnnouncementCardProps) {
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      onPress={() => onOpen(id)}
      haptic="tapLight"
      style={continuousCorners}
      className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
    >
      {imageSource === null ? null : (
        <Image
          source={imageSource}
          accessibilityLabel={imageAlt ?? undefined}
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={id}
          style={styles.image}
        />
      )}
      <View className="gap-sm p-md">
        <View className="flex-row flex-wrap items-center gap-sm">
          <View className="rounded-full bg-neutral-100 px-sm py-xs" style={continuousCorners}>
            <Text className={`text-sm font-medium text-neutral-700 ${languageFontClass}`}>
              {category}
            </Text>
          </View>
          {isPinned ? (
            <View className="rounded-full bg-secondary px-sm py-xs" style={continuousCorners}>
              <Text className={`text-sm font-semibold text-neutral-900 ${languageFontClass}`}>
                {pinnedLabel}
              </Text>
            </View>
          ) : null}
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

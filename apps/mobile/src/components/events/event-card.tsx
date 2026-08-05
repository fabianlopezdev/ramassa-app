import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { StyleSheet, Text, View } from 'react-native';
import type { EventCategoryColor } from '@ramassa/shared/events';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.colors.neutral[200],
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.white,
  },
});

export function eventCategoryColor(color: EventCategoryColor): string {
  switch (color) {
    case 'primary':
      return tokens.colors.primary.DEFAULT;
    case 'secondary':
      return tokens.colors.secondary.dark;
    case 'accent':
      return tokens.colors.info;
    case 'chart-1':
      return tokens.colors.success;
    case 'chart-2':
      return tokens.colors.warning;
    case 'chart-3':
      return tokens.colors.error;
  }
}

export interface EventCardProps {
  readonly eventId: string;
  readonly occurrenceId: string;
  readonly title: string;
  readonly category: string;
  readonly categoryColor: EventCategoryColor;
  readonly date: string;
  readonly time: string;
  readonly location: string;
  readonly capacityLabel: string;
  readonly signupLabel: string | null;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly onOpen: (occurrenceId: string) => void;
}

export function EventCard({
  eventId,
  occurrenceId,
  title,
  category,
  categoryColor,
  date,
  time,
  location,
  capacityLabel,
  signupLabel,
  accessibilityLabel,
  languageFontClass,
  onOpen,
}: EventCardProps) {
  return (
    <View testID={`event-card-${eventId}-${occurrenceId}`}>
      <PressableScale
        accessibilityLabel={accessibilityLabel}
        onPress={() => onOpen(occurrenceId)}
        haptic="tapLight"
        style={[continuousCorners, styles.card]}
        className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
      >
        <View className="h-xs" style={{ backgroundColor: eventCategoryColor(categoryColor) }} />
        <View className="gap-sm p-md">
          <View className="flex-row flex-wrap items-center gap-sm">
            <View className="flex-row items-center gap-xs rounded-full bg-neutral-100 px-sm py-xs">
              <View
                className="h-sm w-sm rounded-full"
                style={{ backgroundColor: eventCategoryColor(categoryColor) }}
              />
              <Text className={`text-sm font-medium text-neutral-700 ${languageFontClass}`}>
                {category}
              </Text>
            </View>
            {signupLabel === null ? null : (
              <View className="rounded-full bg-secondary-light px-sm py-xs">
                <Text className={`text-sm font-semibold text-neutral-900 ${languageFontClass}`}>
                  {signupLabel}
                </Text>
              </View>
            )}
          </View>
          <Text
            className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
            numberOfLines={2}
          >
            {title}
          </Text>
          <Text className={`text-start text-md font-medium text-primary-dark ${languageFontClass}`}>
            {date} · {time}
          </Text>
          <Text
            className={`text-start text-md text-neutral-700 ${languageFontClass}`}
            numberOfLines={2}
          >
            {location}
          </Text>
          <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
            {capacityLabel}
          </Text>
        </View>
      </PressableScale>
    </View>
  );
}

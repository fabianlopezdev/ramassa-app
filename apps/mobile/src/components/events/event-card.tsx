import { PressableScale } from '@/components/motion/pressable-scale';
import { composeContinuousViewStyle } from '@/lib/continuous-corners';
import { memo, useCallback } from 'react';
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
const categoryBackgroundStyles = StyleSheet.create({
  primary: { backgroundColor: tokens.colors.primary.DEFAULT },
  secondary: { backgroundColor: tokens.colors.secondary.dark },
  accent: { backgroundColor: tokens.colors.info },
  'chart-1': { backgroundColor: tokens.colors.success },
  'chart-2': { backgroundColor: tokens.colors.warning },
  'chart-3': { backgroundColor: tokens.colors.error },
});
const cardStyle = composeContinuousViewStyle(styles.card);

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

export function eventCategoryBackgroundStyle(color: EventCategoryColor) {
  return categoryBackgroundStyles[color];
}

export function EventDetailLine({
  label,
  value,
  languageFontClass,
}: {
  readonly label: string;
  readonly value: string;
  readonly languageFontClass: string;
}) {
  return (
    <View className="gap-xs">
      <Text className={`text-start text-sm font-semibold text-neutral-500 ${languageFontClass}`}>
        {label}
      </Text>
      <Text
        selectable
        className={`text-start text-md tabular-nums text-neutral-900 ${languageFontClass}`}
      >
        {value}
      </Text>
    </View>
  );
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
  readonly onOpen: (eventId: string, occurrenceId: string) => void;
}

export const EventCard = memo(function EventCard({
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
  const handlePress = useCallback(
    () => onOpen(eventId, occurrenceId),
    [eventId, occurrenceId, onOpen],
  );

  return (
    <View testID={`event-card-${eventId}-${occurrenceId}`}>
      <PressableScale
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        haptic="tapLight"
        style={cardStyle}
        className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
      >
        <View
          accessible={false}
          className="h-xs"
          style={eventCategoryBackgroundStyle(categoryColor)}
        />
        <View className="gap-sm p-md">
          <View className="flex-row flex-wrap items-center gap-sm">
            <View className="flex-row items-center gap-xs rounded-full bg-neutral-100 px-sm py-xs">
              <View
                accessible={false}
                className="h-sm w-sm rounded-full"
                style={eventCategoryBackgroundStyle(categoryColor)}
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
          <Text
            className={`text-start text-md font-medium tabular-nums text-primary-dark ${languageFontClass}`}
          >
            {date} · {time}
          </Text>
          <Text
            className={`text-start text-md text-neutral-700 ${languageFontClass}`}
            numberOfLines={2}
          >
            {location}
          </Text>
          <Text className={`text-start text-sm tabular-nums text-neutral-500 ${languageFontClass}`}>
            {capacityLabel}
          </Text>
        </View>
      </PressableScale>
    </View>
  );
});

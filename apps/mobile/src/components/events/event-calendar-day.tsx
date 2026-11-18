/**
 * One day of the Activitats calendar in the raised style (RAPP-841). A day
 * with activities is a raised box with one dot per kind of activity, so it
 * reads as something to press; the chosen day fills with the yellow of the
 * chosen filter chip; today has a ring. Other days are plain numbers.
 *
 * Every day presses with the full height of a tap target, whatever the size
 * of the box drawn inside it.
 */
import {
  outlinedSurfaceClassName,
  RaisedSurfaceEdge,
  raisedSurfaceWrapperStyle,
} from '@/components/layout/raised-surface';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { continuousCorners } from '@/lib/continuous-corners';
import { eventDateKey } from '@/lib/event-calendar';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DateData } from 'react-native-calendars';
import type { DayProps } from 'react-native-calendars/src/calendar/day';
import { tokens } from '@ramassa/shared/tokens';

/** The box drawn for a day: a tap target less the room around it in its column. */
export const CALENDAR_DAY_FACE_SIZE = tokens.tapTarget.min - tokens.spacing.sm;
/** The corners of a day box, smaller than a card's to suit its size. */
export const CALENDAR_DAY_SHAPE_CLASS_NAME = 'rounded-md';
/** As many dots as fit across a day box; the day's label still names every activity. */
const MAX_VISIBLE_DOTS = 3;

const styles = StyleSheet.create({
  target: { minHeight: tokens.tapTarget.min, alignSelf: 'stretch' },
  face: {
    ...continuousCorners,
    width: CALENDAR_DAY_FACE_SIZE,
    height: CALENDAR_DAY_FACE_SIZE,
  },
  dot: {
    width: tokens.spacing.sm,
    height: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
  },
  number: { fontVariant: ['tabular-nums'] },
});

const RAISED_FACE_CLASS_NAME = `relative items-center justify-center overflow-hidden ${outlinedSurfaceClassName(
  CALENDAR_DAY_SHAPE_CLASS_NAME,
)}`;

type EventCalendarDayProps = DayProps & {
  readonly date?: DateData;
  readonly children?: ReactNode;
};

function DayNumber({
  children,
  isDisabled,
  isToday,
}: {
  readonly children: ReactNode;
  readonly isDisabled: boolean;
  readonly isToday: boolean;
}) {
  const languageFontClass = useLanguageFontClass();
  const colorClassName = isDisabled
    ? 'text-neutral-400'
    : isToday
      ? 'text-primary-dark'
      : 'text-neutral-900';
  return (
    <Text
      style={styles.number}
      className={`text-md ${isToday ? 'font-extrabold' : 'font-semibold'} ${colorClassName} ${languageFontClass}`}
    >
      {children}
    </Text>
  );
}

function EventCalendarDayInner({
  date,
  state,
  marking,
  onPress,
  accessibilityLabel,
  testID,
  children,
}: EventCalendarDayProps) {
  const handlePress = useCallback(() => onPress?.(date), [date, onPress]);
  const dots = marking?.dots?.slice(0, MAX_VISIBLE_DOTS) ?? [];
  const isSelected = marking?.selected === true;
  const isDisabled = state === 'disabled';
  const isToday = date !== undefined && date.dateString === eventDateKey(new Date().toISOString());
  const label = accessibilityLabel ?? date?.dateString ?? '';
  const number = (
    <DayNumber isDisabled={isDisabled} isToday={isToday}>
      {children}
    </DayNumber>
  );

  if (!isSelected && dots.length === 0) {
    return (
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={handlePress}
        haptic="selection"
        style={styles.target}
        className="items-center justify-center"
      >
        <View
          style={styles.face}
          className={`items-center justify-center rounded-full ${
            isToday ? 'border-2 border-primary bg-primary/10' : ''
          }`}
        >
          {number}
        </View>
      </PressableScale>
    );
  }

  return (
    <View style={styles.target} className="items-center justify-center">
      <PressableDepth
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        isSelected={isSelected}
        onPress={handlePress}
        haptic="selection"
        style={raisedSurfaceWrapperStyle}
        className="relative"
        faceStyle={styles.face}
        faceClassName={RAISED_FACE_CLASS_NAME}
        inlineOffset={tokens.languageChoice.shadowInlineOffset}
        blockOffset={tokens.languageChoice.shadowBlockOffset}
        shadow={<RaisedSurfaceEdge shapeClassName={CALENDAR_DAY_SHAPE_CLASS_NAME} />}
      >
        <SelectionTransition
          active={isSelected}
          duration="base"
          className="absolute inset-0 bg-secondary"
        />
        {number}
        {dots.length === 0 ? null : (
          <View accessible={false} className="flex-row gap-xs">
            {dots.map((dot) => (
              <View key={dot.key} style={[styles.dot, { backgroundColor: dot.color }]} />
            ))}
          </View>
        )}
      </PressableDepth>
    </View>
  );
}

export const EventCalendarDay = memo(EventCalendarDayInner);

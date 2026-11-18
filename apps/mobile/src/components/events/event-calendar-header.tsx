/**
 * The header of the Activitats calendar (RAPP-841): raised arrows that fill
 * with the selection yellow while they are held, the month in her language,
 * and the day names, with Saturday and Sunday on the tinted weekend column.
 *
 * The calendar library renders it as its `customHeader` and only passes its
 * own props, so the labels in her language arrive through a context.
 */
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import {
  CALENDAR_DAY_FACE_SIZE,
  CALENDAR_DAY_SHAPE_CLASS_NAME,
  WEEKEND_COLUMN_CLASS_NAME,
} from '@/components/events/event-calendar-day';
import { BACKWARD_CHEVRON, FORWARD_CHEVRON } from '@/components/icons/direction';
import { Icon, type IconName } from '@/components/icons/icon';
import { RaisedPressable } from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { isWeekendWeekdayIndex, mondayFirstWeekdayIndexes } from '@/lib/event-calendar';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { createContext, useCallback, useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const PREVIOUS_MONTH = -1;
const NEXT_MONTH = 1;

const styles = StyleSheet.create({
  arrowFace: {
    ...continuousCorners,
    width: CALENDAR_DAY_FACE_SIZE,
    height: CALENDAR_DAY_FACE_SIZE,
  },
});

export interface EventCalendarHeaderLabels {
  /** Month names in her language, January first. */
  readonly monthNames: readonly string[];
  /** Short day names in her language, Sunday first. */
  readonly dayNamesShort: readonly string[];
  readonly previousMonthLabel: string;
  readonly nextMonthLabel: string;
}

export const EventCalendarHeaderLabelsContext = createContext<EventCalendarHeaderLabels | null>(
  null,
);

function MonthArrow({
  icon,
  label,
  step,
  addMonth,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly step: number;
  readonly addMonth?: (count: number) => void;
}) {
  const brandColor = useBrandColor();
  const handlePress = useCallback(() => addMonth?.(step), [addMonth, step]);
  return (
    <RaisedPressable
      accessibilityLabel={label}
      onPress={handlePress}
      faceStyle={styles.arrowFace}
      faceClassName="items-center justify-center"
      pressedFillClassName="bg-secondary"
      shapeClassName={CALENDAR_DAY_SHAPE_CLASS_NAME}
    >
      <Icon name={icon} size={tokens.fontSize['2xl']} color={brandColor} />
    </RaisedPressable>
  );
}

/** The props the calendar library passes to its `customHeader`, as far as this header uses them. */
interface CalendarHeaderProps {
  /** The library's XDate; only its `Date`-compatible getters are read. */
  readonly month?: { getMonth(): number; getFullYear(): number };
  readonly addMonth?: (count: number) => void;
  readonly testID?: string;
}

export function EventCalendarHeader({ month, addMonth, testID }: CalendarHeaderProps) {
  const labels = useContext(EventCalendarHeaderLabelsContext);
  const languageFontClass = useLanguageFontClass();
  if (labels === null || month === undefined) return null;
  const title = `${labels.monthNames[month.getMonth()] ?? ''} ${month.getFullYear()}`;
  return (
    <View testID={testID} className="gap-sm pt-sm">
      <View className="flex-row items-center justify-between gap-sm px-sm">
        <MonthArrow
          icon={BACKWARD_CHEVRON}
          label={labels.previousMonthLabel}
          step={PREVIOUS_MONTH}
          addMonth={addMonth}
        />
        <Text
          accessibilityRole="header"
          className={`shrink text-center text-2xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {title}
        </Text>
        <MonthArrow
          icon={FORWARD_CHEVRON}
          label={labels.nextMonthLabel}
          step={NEXT_MONTH}
          addMonth={addMonth}
        />
      </View>
      <View accessible={false} className="flex-row">
        {mondayFirstWeekdayIndexes.map((weekdayIndex) => (
          <View
            key={weekdayIndex}
            className={`flex-1 items-center py-sm ${
              isWeekendWeekdayIndex(weekdayIndex) ? WEEKEND_COLUMN_CLASS_NAME : ''
            }`}
          >
            <Text className={`text-md font-semibold text-neutral-500 ${languageFontClass}`}>
              {labels.dayNamesShort[weekdayIndex]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The month calendar on Activitats in the raised style (RAPP-841): an
 * outlined panel with its own header (`EventCalendarHeader`: raised arrows,
 * the month, the day names) and raised days where there are activities
 * (`EventCalendarDay`). Saturday and Sunday run down a grey column that
 * reaches the edges of the panel (RAPP-843), so the panel has no side
 * padding. Every month shows six weeks, with the first days of the next
 * month in the rows the month leaves free, so the calendar keeps one height
 * and the list under it never moves (RAPP-844). Weeks start on Monday and the
 * month and day names come in her language.
 */
import { EventCalendarDay } from '@/components/events/event-calendar-day';
import {
  EventCalendarHeader,
  EventCalendarHeaderLabelsContext,
} from '@/components/events/event-calendar-header';
import { outlinedSurfaceClassName } from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { buildCalendarLocale, monthKeyOf, weeksAfterMonth } from '@/lib/event-calendar';
import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import type { MarkedDates } from 'react-native-calendars/src/types';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const CALENDAR_FIRST_DAY_MONDAY = 1;
const DATE_PART_YEAR = 0;
const DATE_PART_MONTH = 1;
const DATE_PART_DAY = 2;

const calendarTheme = {
  calendarBackground: tokens.colors.white,
  weekVerticalMargin: 0,
} as const;
/** The library pads its month at the sides; the weekend columns run to the edge instead. */
const calendarStyle = { paddingLeft: 0, paddingRight: 0 } as const;
/** The week row and day cell of the library, so the added weeks line up with its own. */
const styles = StyleSheet.create({
  week: { flexDirection: 'row', justifyContent: 'space-around' },
  dayContainer: { flex: 1, alignItems: 'center' },
});

function dateDataOf(dateKey: string): DateData {
  const parts = dateKey.split('-').map(Number);
  return {
    dateString: dateKey,
    year: parts[DATE_PART_YEAR] ?? 0,
    month: parts[DATE_PART_MONTH] ?? 0,
    day: parts[DATE_PART_DAY] ?? 0,
    timestamp: Date.parse(dateKey),
  };
}

/**
 * The weeks of the next month that bring a short month to six weeks. The
 * library's own six-weeks option counts them wrong when weeks start on Monday,
 * so they are drawn here with the same day cells. Its days look like the next
 * month's days the library already shows, and pressing one opens that month.
 */
function WeeksAfterMonth({
  monthKey,
  markedDates,
  onPressDay,
}: {
  readonly monthKey: string;
  readonly markedDates: MarkedDates;
  readonly onPressDay: (day?: DateData) => void;
}) {
  const weeks = useMemo(() => weeksAfterMonth(monthKey), [monthKey]);
  return weeks.map((week) => (
    <View key={week[0]} style={styles.week}>
      {week.map((dateKey) => {
        const date = dateDataOf(dateKey);
        return (
          <View key={dateKey} style={styles.dayContainer}>
            <EventCalendarDay
              date={date}
              state="disabled"
              marking={markedDates[dateKey]}
              onPress={onPressDay}
            >
              {String(date.day)}
            </EventCalendarDay>
          </View>
        );
      })}
    </View>
  ));
}

/**
 * Memoised: the view switch above it re-renders the screen first (RAPP-841),
 * and the calendar should not redraw its weeks for that.
 */
export const EventMonthCalendar = memo(function EventMonthCalendar({
  language,
  todayLabel,
  previousMonthLabel,
  nextMonthLabel,
  current,
  minDate,
  markedDates,
  onSelectDay,
  testID,
}: {
  readonly language: SupportedLanguage;
  readonly todayLabel: string;
  readonly previousMonthLabel: string;
  readonly nextMonthLabel: string;
  /** The month shown first, as the date it contains. */
  readonly current: string;
  readonly minDate: string;
  readonly markedDates: MarkedDates;
  readonly onSelectDay: (date: string) => void;
  readonly testID?: string;
}) {
  const localeKey = `ramassa-${language}`;
  const locale = useMemo(() => buildCalendarLocale(language, todayLabel), [language, todayLabel]);
  const localeDefinition = useMemo(
    () => ({
      monthNames: [...locale.monthNames],
      monthNamesShort: [...locale.monthNamesShort],
      dayNames: [...locale.dayNames],
      dayNamesShort: [...locale.dayNamesShort],
      today: locale.today,
    }),
    [locale],
  );
  LocaleConfig.locales[localeKey] = localeDefinition;
  LocaleConfig.defaultLocale = localeKey;
  const headerLabels = useMemo(
    () => ({
      monthNames: locale.monthNames,
      dayNamesShort: locale.dayNamesShort,
      previousMonthLabel,
      nextMonthLabel,
    }),
    [locale, nextMonthLabel, previousMonthLabel],
  );
  const handleDayPress = useCallback((day: DateData) => onSelectDay(day.dateString), [onSelectDay]);
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(current));
  // The library moves to another month only when `initialDate` changes, so a
  // press on an added day sets it.
  const [openedDate, setOpenedDate] = useState<string | undefined>(undefined);
  const handleMonthChange = useCallback(
    (month: DateData) => setMonthKey(monthKeyOf(month.dateString)),
    [],
  );
  const handleAddedDayPress = useCallback(
    (day?: DateData) => {
      if (day === undefined) return;
      setOpenedDate(day.dateString);
      onSelectDay(day.dateString);
    },
    [onSelectDay],
  );

  return (
    <EventCalendarHeaderLabelsContext.Provider value={headerLabels}>
      <View className={`overflow-hidden ${outlinedSurfaceClassName()}`} style={continuousCorners}>
        <Calendar
          key={localeKey}
          current={current}
          initialDate={openedDate}
          minDate={minDate}
          firstDay={CALENDAR_FIRST_DAY_MONDAY}
          markingType="multi-dot"
          markedDates={markedDates}
          enableSwipeMonths
          onMonthChange={handleMonthChange}
          onDayPress={handleDayPress}
          dayComponent={EventCalendarDay}
          customHeader={EventCalendarHeader}
          testID={testID}
          theme={calendarTheme}
          style={calendarStyle}
        />
        <WeeksAfterMonth
          monthKey={monthKey}
          markedDates={markedDates}
          onPressDay={handleAddedDayPress}
        />
      </View>
    </EventCalendarHeaderLabelsContext.Provider>
  );
});

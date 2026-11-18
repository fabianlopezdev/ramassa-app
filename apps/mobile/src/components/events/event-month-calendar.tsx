/**
 * The month calendar on Activitats in the raised style (RAPP-841): an
 * outlined panel with its own header (`EventCalendarHeader`: raised arrows,
 * the month, the day names) and raised days where there are activities
 * (`EventCalendarDay`). Saturday and Sunday run down a tinted column. Weeks
 * start on Monday and the month and day names come in her language.
 */
import { EventCalendarDay } from '@/components/events/event-calendar-day';
import {
  EventCalendarHeader,
  EventCalendarHeaderLabelsContext,
} from '@/components/events/event-calendar-header';
import { outlinedSurfaceClassName } from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { buildCalendarLocale } from '@/lib/event-calendar';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import type { MarkedDates } from 'react-native-calendars/src/types';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const CALENDAR_FIRST_DAY_MONDAY = 1;

const calendarTheme = {
  calendarBackground: tokens.colors.white,
  weekVerticalMargin: 0,
} as const;

export function EventMonthCalendar({
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

  return (
    <EventCalendarHeaderLabelsContext.Provider value={headerLabels}>
      <View
        className={`overflow-hidden px-xs ${outlinedSurfaceClassName()}`}
        style={continuousCorners}
      >
        <Calendar
          key={localeKey}
          current={current}
          minDate={minDate}
          firstDay={CALENDAR_FIRST_DAY_MONDAY}
          markingType="multi-dot"
          markedDates={markedDates}
          enableSwipeMonths
          onDayPress={handleDayPress}
          dayComponent={EventCalendarDay}
          customHeader={EventCalendarHeader}
          testID={testID}
          theme={calendarTheme}
        />
      </View>
    </EventCalendarHeaderLabelsContext.Provider>
  );
}

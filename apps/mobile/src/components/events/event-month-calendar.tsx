/**
 * The month calendar on Activitats in the raised style (RAPP-841): an
 * outlined panel, raised arrows to change month, and raised days where there
 * are activities (see `EventCalendarDay`). Weeks start on Monday and the
 * month and day names come in her language.
 */
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import {
  CALENDAR_DAY_FACE_SIZE,
  CALENDAR_DAY_SHAPE_CLASS_NAME,
  EventCalendarDay,
} from '@/components/events/event-calendar-day';
import { BACKWARD_CHEVRON, FORWARD_CHEVRON } from '@/components/icons/direction';
import { Icon } from '@/components/icons/icon';
import { outlinedSurfaceClassName, RaisedPanel } from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { buildCalendarLocale } from '@/lib/event-calendar';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import type { Direction, MarkedDates } from 'react-native-calendars/src/types';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const CALENDAR_FIRST_DAY_MONDAY = 1;

const styles = StyleSheet.create({
  arrowFace: {
    ...continuousCorners,
    width: CALENDAR_DAY_FACE_SIZE,
    height: CALENDAR_DAY_FACE_SIZE,
  },
});

const calendarTheme = {
  calendarBackground: tokens.colors.white,
  monthTextColor: tokens.colors.neutral[900],
  textMonthFontSize: tokens.fontSize['2xl'],
  textMonthFontWeight: 'bold',
  textSectionTitleColor: tokens.colors.neutral[500],
  textDayHeaderFontSize: tokens.fontSize.md,
  textDayHeaderFontWeight: '600',
  weekVerticalMargin: 0,
  arrowStyle: { padding: 0 },
} as const;

function CalendarArrow({ direction }: { readonly direction: Direction }) {
  const brandColor = useBrandColor();
  return (
    <RaisedPanel
      shapeClassName={CALENDAR_DAY_SHAPE_CLASS_NAME}
      faceClassName="items-center justify-center"
      faceStyle={styles.arrowFace}
    >
      <Icon
        name={direction === 'left' ? BACKWARD_CHEVRON : FORWARD_CHEVRON}
        size={tokens.fontSize['2xl']}
        color={brandColor}
      />
    </RaisedPanel>
  );
}

const renderArrow = (direction: Direction) => <CalendarArrow direction={direction} />;

export function EventMonthCalendar({
  language,
  todayLabel,
  current,
  minDate,
  markedDates,
  onSelectDay,
  testID,
}: {
  readonly language: SupportedLanguage;
  readonly todayLabel: string;
  /** The month shown first, as the date it contains. */
  readonly current: string;
  readonly minDate: string;
  readonly markedDates: MarkedDates;
  readonly onSelectDay: (date: string) => void;
  readonly testID?: string;
}) {
  const localeKey = `ramassa-${language}`;
  const localeDefinition = useMemo(() => {
    const locale = buildCalendarLocale(language, todayLabel);
    return {
      monthNames: [...locale.monthNames],
      monthNamesShort: [...locale.monthNamesShort],
      dayNames: [...locale.dayNames],
      dayNamesShort: [...locale.dayNamesShort],
      today: locale.today,
    };
  }, [language, todayLabel]);
  LocaleConfig.locales[localeKey] = localeDefinition;
  LocaleConfig.defaultLocale = localeKey;
  const handleDayPress = useCallback((day: DateData) => onSelectDay(day.dateString), [onSelectDay]);

  return (
    <View
      className={`overflow-hidden px-xs pb-sm ${outlinedSurfaceClassName()}`}
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
        renderArrow={renderArrow}
        testID={testID}
        theme={calendarTheme}
      />
    </View>
  );
}

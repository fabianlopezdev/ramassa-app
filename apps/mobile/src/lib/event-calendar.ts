import { MADRID_TIME_ZONE, type PlayerEventOccurrence } from '@ramassa/shared/events';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type { PrivateMentoringCalendarEntry } from '@ramassa/shared/mentoring';
import { tokens } from '@ramassa/shared/tokens';

const CALENDAR_SELECTED_COLOR = tokens.colors.primary.light;
const GREGORIAN_MONTH_COUNT = 12;
const WEEKDAY_COUNT = 7;
const REFERENCE_YEAR = 2026;
const FIRST_DAY_OF_MONTH = 1;
const REFERENCE_SUNDAY_MONTH = 7;
const REFERENCE_SUNDAY_DAY = 2;
const eventDateKeyFormatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: MADRID_TIME_ZONE,
});

export interface CalendarLocaleDefinition {
  readonly monthNames: readonly string[];
  readonly monthNamesShort: readonly string[];
  readonly dayNames: readonly string[];
  readonly dayNamesShort: readonly string[];
  readonly today: string;
}

export interface EventCalendarMark {
  readonly selected?: boolean;
  readonly selectedColor?: string;
  readonly accessibilityLabel?: string;
  readonly dots: readonly { readonly key: string; readonly color: string }[];
}

function gregorianLocale(language: SupportedLanguage): string {
  return `${language}-u-ca-gregory`;
}

export function buildCalendarLocale(
  language: SupportedLanguage,
  today: string,
): CalendarLocaleDefinition {
  const locale = gregorianLocale(language);
  const longMonth = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  const shortMonth = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const shortDay = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });

  return {
    monthNames: Array.from({ length: GREGORIAN_MONTH_COUNT }, (_unused, month) =>
      longMonth.format(new Date(Date.UTC(REFERENCE_YEAR, month, FIRST_DAY_OF_MONTH))),
    ),
    monthNamesShort: Array.from({ length: GREGORIAN_MONTH_COUNT }, (_unused, month) =>
      shortMonth.format(new Date(Date.UTC(REFERENCE_YEAR, month, FIRST_DAY_OF_MONTH))),
    ),
    // 2 August 2026 is a Sunday. react-native-calendars requires locale arrays
    // to start on Sunday even when firstDay={1} displays Monday first.
    dayNames: Array.from({ length: WEEKDAY_COUNT }, (_unused, day) =>
      longDay.format(
        new Date(Date.UTC(REFERENCE_YEAR, REFERENCE_SUNDAY_MONTH, REFERENCE_SUNDAY_DAY + day)),
      ),
    ),
    dayNamesShort: Array.from({ length: WEEKDAY_COUNT }, (_unused, day) =>
      shortDay.format(
        new Date(Date.UTC(REFERENCE_YEAR, REFERENCE_SUNDAY_MONTH, REFERENCE_SUNDAY_DAY + day)),
      ),
    ),
    today,
  };
}

export function eventDateKey(instant: string): string {
  const parts = eventDateKeyFormatter.formatToParts(new Date(instant));
  let year = '';
  let month = '';
  let day = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }
  return `${year}-${month}-${day}`;
}

export function buildEventMarkedDates(
  rows: readonly PlayerEventOccurrence[],
  selectedDate: string | null,
  colorForCategory: (categoryId: string) => string,
  accessibilityLabelForDate?: (date: string) => string,
): Readonly<Record<string, EventCalendarMark>> {
  const categoriesByDate = new Map<string, Set<string>>();
  for (const row of rows) {
    const date = eventDateKey(row.occurrence_starts_at);
    const categories = categoriesByDate.get(date) ?? new Set<string>();
    categories.add(row.event.category_id);
    categoriesByDate.set(date, categories);
  }

  const dates = new Set(categoriesByDate.keys());
  if (selectedDate !== null) dates.add(selectedDate);
  return Object.fromEntries(
    [...dates].map((date) => {
      const categories = [...(categoriesByDate.get(date) ?? [])];
      const accessibilityLabel = accessibilityLabelForDate?.(date);
      return [
        date,
        {
          ...(accessibilityLabel === undefined ? {} : { accessibilityLabel }),
          ...(date === selectedDate
            ? {
                selected: true,
                selectedColor: CALENDAR_SELECTED_COLOR,
              }
            : {}),
          dots: categories.map((categoryId) => ({
            key: categoryId,
            color: colorForCategory(categoryId),
          })),
        },
      ];
    }),
  );
}

export function addPrivateMentoringMarkedDates(
  base: Readonly<Record<string, EventCalendarMark>>,
  entries: readonly PrivateMentoringCalendarEntry[],
  accessibilityLabelForDate?: (date: string) => string,
): Readonly<Record<string, EventCalendarMark>> {
  const marks: Record<string, EventCalendarMark> = { ...base };
  for (const entry of entries) {
    const date = eventDateKey(entry.scheduledAt);
    const current = marks[date] ?? { dots: [] };
    if (current.dots.some((dot) => dot.key === 'private-mentoring')) continue;
    const mentoringAccessibilityLabel = accessibilityLabelForDate?.(date);
    const accessibilityLabel =
      mentoringAccessibilityLabel === undefined
        ? current.accessibilityLabel
        : current.accessibilityLabel === undefined
          ? mentoringAccessibilityLabel
          : `${current.accessibilityLabel}. ${mentoringAccessibilityLabel}`;
    marks[date] = {
      ...current,
      ...(accessibilityLabel === undefined ? {} : { accessibilityLabel }),
      dots: [...current.dots, { key: 'private-mentoring', color: tokens.colors.secondary.dark }],
    };
  }
  return marks;
}

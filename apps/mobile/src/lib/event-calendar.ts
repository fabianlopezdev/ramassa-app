import type { PlayerEventOccurrence } from '@ramassa/shared/events';
import type { SupportedLanguage } from '@ramassa/shared/i18n';

const MADRID_TIME_ZONE = 'Europe/Madrid';
const CALENDAR_SELECTED_COLOR = '#E6F3F8';

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
    monthNames: Array.from({ length: 12 }, (_unused, month) =>
      longMonth.format(new Date(Date.UTC(2026, month, 1))),
    ),
    monthNamesShort: Array.from({ length: 12 }, (_unused, month) =>
      shortMonth.format(new Date(Date.UTC(2026, month, 1))),
    ),
    // 2 August 2026 is a Sunday. react-native-calendars requires locale arrays
    // to start on Sunday even when firstDay={1} displays Monday first.
    dayNames: Array.from({ length: 7 }, (_unused, day) =>
      longDay.format(new Date(Date.UTC(2026, 7, 2 + day))),
    ),
    dayNamesShort: Array.from({ length: 7 }, (_unused, day) =>
      shortDay.format(new Date(Date.UTC(2026, 7, 2 + day))),
    ),
    today,
  };
}

export function eventDateKey(instant: string): string {
  const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: MADRID_TIME_ZONE,
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function buildEventMarkedDates(
  rows: readonly PlayerEventOccurrence[],
  selectedDate: string | null,
  colorForCategory: (categoryId: string) => string,
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
      return [
        date,
        {
          ...(date === selectedDate
            ? { selected: true, selectedColor: CALENDAR_SELECTED_COLOR }
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

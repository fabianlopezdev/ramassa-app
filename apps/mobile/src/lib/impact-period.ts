/**
 * The impact dashboard's periods on the phone (RAPP-400): the last 7 days,
 * the last 30 days, or this year from 1 January, which is the web admin's
 * default period. Dates are Madrid calendar days, as the report counts them.
 * A pure module, so the unit tests run without the app's Supabase client.
 */
export type ImpactPeriod = 'week' | 'month' | 'year';

export const IMPACT_PERIODS: readonly ImpactPeriod[] = ['week', 'month', 'year'];

const DAY = 24 * 60 * 60 * 1000;

function madridDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** The first and last Madrid day of a period that ends today. */
export function impactPeriodRange(
  period: ImpactPeriod,
  now: Date = new Date(),
): { readonly startDate: string; readonly endDate: string } {
  const endDate = madridDate(now);
  if (period === 'year') return { startDate: `${endDate.slice(0, 4)}-01-01`, endDate };
  // Counted on the calendar, so a daylight saving change cannot shift a day.
  const [year, month, day] = endDate.split('-').map(Number) as [number, number, number];
  const back = period === 'week' ? 6 : 29;
  const start = new Date(Date.UTC(year, month - 1, day) - back * DAY);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

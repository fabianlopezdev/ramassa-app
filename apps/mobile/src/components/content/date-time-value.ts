/**
 * The arithmetic behind the date-and-time field (RAPP-341), kept free of
 * React Native so it is tested on its own. Event times are Madrid times
 * (RAPP-342), as on the web admin: the picker then shows and returns the
 * Madrid wall clock, whatever time zone the phone is set to.
 */
import { toMadridLocalInput, toUtcInstant } from '@ramassa/shared/events';

const pad = (value: number) => String(value).padStart(2, '0');

/** The Madrid wall clock of an ISO value, as a phone-local date the picker can show. */
export function madridWallClock(value: string): Date {
  const [day = '', time = ''] = toMadridLocalInput(value).split('T');
  const [year, month, date] = day.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, date, hours, minutes);
}

/** A phone-local date read as a Madrid wall clock, back to an ISO value. */
export function fromMadridWallClock(date: Date): string {
  return toUtcInstant(
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}`,
  );
}

/** How a field turns its ISO value into the picker's date and back. */
export interface PickerClock {
  readonly toPicker: (value: string) => Date;
  readonly fromPicker: (date: Date) => string;
}

export const DEVICE_CLOCK: PickerClock = {
  toPicker: (value) => new Date(value),
  fromPicker: (date) => date.toISOString(),
};

export const MADRID_CLOCK: PickerClock = {
  toPicker: madridWallClock,
  fromPicker: fromMadridWallClock,
};

/** An empty value opens the picker tomorrow at 09:00, a time worth publishing at. */
export function defaultPickerDate(
  value: string | null,
  now = new Date(),
  clock: PickerClock = DEVICE_CLOCK,
): Date {
  if (value !== null) return clock.toPicker(value);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow;
}

/** The base value with its day or its time taken from the picked value. */
export function combineDateAndTime(base: Date, picked: Date, mode: 'date' | 'time'): Date {
  const next = new Date(base);
  if (mode === 'date') {
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  } else {
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  }
  return next;
}

/** An ISO value as a `datetime-local` input wants it, in the device's time or Madrid's. */
export function toLocalInputValue(value: string | null, inMadridTime = false): string {
  if (value === null) return '';
  if (inMadridTime) return toMadridLocalInput(value);
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromLocalInputValue(value: string, inMadridTime = false): string | null {
  if (value.length === 0) return null;
  if (inMadridTime) {
    try {
      return toUtcInstant(value);
    } catch {
      return null;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A calendar date (`YYYY-MM-DD`) as a local date, or null when empty or broken. */
export function fromIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A local date as a calendar date (`YYYY-MM-DD`). */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

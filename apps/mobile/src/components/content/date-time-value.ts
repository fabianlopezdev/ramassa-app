/**
 * The arithmetic behind the date-and-time field (RAPP-341), kept free of
 * React Native so it is tested on its own.
 */

/** An empty value opens the picker tomorrow at 09:00, a time worth publishing at. */
export function defaultPickerDate(value: string | null, now = new Date()): Date {
  if (value !== null) return new Date(value);
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

/** An ISO value as a `datetime-local` input wants it, in the device's time. */
export function toLocalInputValue(value: string | null): string {
  if (value === null) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromLocalInputValue(value: string): string | null {
  if (value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

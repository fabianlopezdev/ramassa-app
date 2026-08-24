const twoDigits = (value: number) => String(value).padStart(2, '0');

export function canonicalDateFromPicker(date: Date): string {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

export function canonicalTimeFromPicker(date: Date): string {
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

export function canonicalDateToPicker(canonicalDate: string, fallback: Date): Date {
  if (canonicalDate.length === 0) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 12);
  }
  const [year, month, day] = canonicalDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function canonicalTimeToPicker(canonicalTime: string, fallback: Date): Date {
  if (canonicalTime.length === 0) return fallback;
  const [hour, minute] = canonicalTime.split(':').map(Number);
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), hour, minute);
}

export function clearPreferredDate(): { preferredDate: ''; preferredTime: '' } {
  return { preferredDate: '', preferredTime: '' };
}

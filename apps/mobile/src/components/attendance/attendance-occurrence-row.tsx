import { RaisedIconCard } from '@/components/layout/raised-icon-card';
import { memo, useCallback } from 'react';

interface AttendanceOccurrenceRowProps {
  readonly id: string;
  readonly title: string;
  readonly location: string;
  readonly time: string;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly onOpen: (id: string) => void;
}

export const AttendanceOccurrenceRow = memo(function AttendanceOccurrenceRow({
  id,
  title,
  location,
  time,
  accessibilityLabel,
  languageFontClass,
  onOpen,
}: AttendanceOccurrenceRowProps) {
  const handleOpen = useCallback(() => onOpen(id), [id, onOpen]);

  return (
    <RaisedIconCard
      testID={`attendance-occurrence-${id}`}
      icon="football"
      title={title}
      detail={`${time} · ${location}`}
      accessibilityLabel={accessibilityLabel}
      languageFontClass={languageFontClass}
      onOpen={handleOpen}
    />
  );
});

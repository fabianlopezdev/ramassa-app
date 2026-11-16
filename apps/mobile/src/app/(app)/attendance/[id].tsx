import { AttendanceSheet } from '@/components/attendance/attendance-sheet';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { useLocalSearchParams } from 'expo-router';

export default function AttendanceSheetScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <NativeScreenHeader />
      <AttendanceSheet occurrenceId={id} />
    </>
  );
}

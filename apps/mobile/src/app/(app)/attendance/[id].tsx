import { AttendanceSheet } from '@/components/attendance/attendance-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function AttendanceSheetScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  return <AttendanceSheet occurrenceId={id} onBack={back} />;
}

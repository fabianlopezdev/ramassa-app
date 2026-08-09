import { AttendanceOccurrenceReport } from '@/components/attendance/attendance-report';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchAttendanceOccurrenceReport } from '@ramassa/shared/attendance';

export const Route = createFileRoute('/_staff/attendance/$occurrenceId')({
  ssr: false,
  loader: ({ params }) => fetchAttendanceOccurrenceReport(supabase, params.occurrenceId),
  component: AttendanceReportPage,
});

function AttendanceReportPage() {
  return <AttendanceOccurrenceReport rows={Route.useLoaderData()} />;
}

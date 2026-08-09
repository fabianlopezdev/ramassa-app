import { AttendanceOverview } from '@/components/attendance/attendance-overview';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import {
  attendanceOverviewSearchSchema,
  fetchAttendanceOverview,
} from '@ramassa/shared/attendance';

export const Route = createFileRoute('/_staff/attendance')({
  ssr: false,
  validateSearch: attendanceOverviewSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchAttendanceOverview(supabase, deps),
  component: AttendancePage,
});

function AttendancePage() {
  return <AttendanceOverview rows={Route.useLoaderData()} search={Route.useSearch()} />;
}

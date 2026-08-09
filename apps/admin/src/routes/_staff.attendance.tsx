import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/attendance')({
  component: AttendanceLayout,
});

function AttendanceLayout() {
  return <Outlet />;
}

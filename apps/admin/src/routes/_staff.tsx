import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff')({
  component: StaffLayout,
});

function StaffLayout() {
  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  );
}

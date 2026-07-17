import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_entity')({
  component: EntityLayout,
});

function EntityLayout() {
  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  );
}

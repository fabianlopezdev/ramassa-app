import { RequireAuth } from '@/components/auth/require-auth';
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff')({
  component: StaffLayout,
});

// Staff and admins only (RAPP-13); an entity user is redirected to their portal.
const STAFF_ROLES = ['staff', 'admin'] as const;

function StaffLayout() {
  return (
    <RequireAuth allow={STAFF_ROLES}>
      <div className="min-h-screen">
        <Outlet />
      </div>
    </RequireAuth>
  );
}

import { RequireAuth } from '@/components/auth/require-auth';
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_entity')({
  component: EntityLayout,
});

// Entity (partner-org) users only (RAPP-13); staff/admins go to the dashboard.
const ENTITY_ROLES = ['entity'] as const;

function EntityLayout() {
  return (
    <RequireAuth allow={ENTITY_ROLES}>
      <div className="min-h-screen">
        <Outlet />
      </div>
    </RequireAuth>
  );
}

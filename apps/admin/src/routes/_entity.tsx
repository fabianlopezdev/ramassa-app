import { RequireAuth } from '@/components/auth/require-auth';
import { EntityNav } from '@/components/nav/entity-nav';
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_entity')({
  component: EntityLayout,
});

// Entity (partner-org) users only (RAPP-13): staff/admins are sent to their
// dashboard and a player gets a terminal no-access screen. Guarding the LAYOUT
// means every entity route is deny-by-default; staff-only routes live outside
// this tree entirely, so an entity user cannot reach them.
const ENTITY_ROLES = ['entity'] as const;

function EntityLayout() {
  return (
    <RequireAuth allow={ENTITY_ROLES}>
      <div className="min-h-screen">
        <EntityNav />
        {/* The portal's single `main` landmark; child routes render sections. */}
        <main>
          <Outlet />
        </main>
      </div>
    </RequireAuth>
  );
}
